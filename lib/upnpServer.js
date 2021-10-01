const http = require('http'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    upnp = require('peer-upnp'),
    elementTree = require('elementtree'),
    xmlEscape = require('xml-escape'),
    jimp = require('jimp'),
    lame = require('lame'),
    defaultGateway = require('default-gateway'),
    { Netmask } = require("netmask"),

    koa = require('koa'),
    koaSend = require('koa-send'),
    koaRange = require('koa-range'),
    koaStatic = require('koa-static'),
    koaRoute = require('koa-route'),
    mkdirp = require('mkdirp-promise'),

    db = require('../common/db'),
    { PassThrough } = require('stream'),
    { sec2mmss } = require('../common/utils'),
    { devOpts, contentDirectoryDescription, avTransportDescription,
        renderingControlDescription, connectionManagerDescription } = require('../common/upnp')

function addSub(elem, tag, text, attrs) {
    attrs && Object.keys(attrs).forEach(key => attrs[key] = xmlEscape(attrs[key]))
    return Object.assign(new elementTree.SubElement(elem, tag, attrs), { text: xmlEscape(text) })
}

const SORT_CAPS = {
    'dir': x => x.dir,
    'dc:date': x => x.time,
    'dc:title': x => x.title,
    'upnp:Album': x => x.album,
    'upnp:originalTrackNumber': x => parseFloat(x.trackNumber),
}

function cmp(a, b) {
    return a > b ? 1 : a < b ? -1 : 0
}

function sortItems(items, sortCriteria) {
    const sortFields = sortCriteria.split(',').filter(x => x)
        .map(field => ({ val: SORT_CAPS[ field.slice(1) ], asc: field[0] === '-' ? -1 : 1 }))
    return items.sort((a, b) =>
        sortFields.map(({ val, asc }) => cmp(val(a), val(b)) * asc).find(x => x !== 0) || 0)
}

const contentDirectoryImpletation = baseUrl => ({
    Browse(inputs) {
        const items =
            inputs.BrowseFlag === 'BrowseMetadata' ?
                [db.browseMeta(inputs.ObjectID)] :
            inputs.BrowseFlag === 'BrowseDirectChildren' ?
                db.browseChild(inputs.ObjectID) : [ ],
            sorted = sortItems(items, inputs.SortCriteria || ''),
            start = parseInt(inputs.StartingIndex) || 0,
            count = parseInt(inputs.RequestedCount) || 10,
            results = sorted.slice(start, start + count)
        return {
            Result: createBrowseResult(results, baseUrl),
            NumberReturned: results.length,
            TotalMatches: items.length,
            UpdateID: 0,
        }
    },
    Search(inputs) {
        const items = db.searchItems(inputs.ContainerID, inputs.SearchCriteria),
            sorted = sortItems(items, inputs.SortCriteria || ''),
            start = parseInt(inputs.StartingIndex) || 0,
            count = parseInt(inputs.RequestedCount) || 10,
            results = sorted.slice(start, start + count)
        return {
            Result: createBrowseResult(results, baseUrl),
            NumberReturned: results.length,
            TotalMatches: items.length,
            UpdateID: 0,
        }
    },
    GetSortCapabilities() {
        return {
            SortCaps: Object.keys(SORT_CAPS).join(',')
        }
    },
    GetSystemUpdateID() {
        return {
            Id: ''
        }
    },
    GetSearchCapabilities() {
        return {
            SearchCaps: ''
        }
    },
})

const avTransportImpletation = () => ({
    GetCurrentTransportActions(inputs) {
        return {
            Actions: 'NOT_IMPLEMENTED',
        }
    },
    GetDeviceCapabilities(inputs) {
        return {
            PlayMedia: '',
            RecMedia: '',
            RecQualityModes: '',
        }
    },
    GetMediaInfo(inputs) {
        return {
            NrTracks: 0,
            MediaDuration: '0',
            CurrentURI: '',
            CurrentURIMetaData: '',
            NextURI: '',
            NextURIMetaData: '',
            PlayMedium: 'NOT_IMPLEMENTED',
            RecordMedium: 'NOT_IMPLEMENTED',
            WriteStatus: 'NOT_IMPLEMENTED',
        }
    },
    GetPositionInfo(inputs) {
        const { path, position, length } = fb2k.send('renderer:query') || { }
        return {
            Track: 0,
            TrackDuration: sec2mmss(length),
            TrackMetaData: '',
            TrackURI: path,
            RelTime: sec2mmss(position),
            AbsTime: sec2mmss(position),
            RelCount: 0,
            AbsCount: 0,
        }
    },
    GetTransportInfo(inputs) {
        return {
            CurrentTransportState: TransportState,
            CurrentTransportStatus: 'OK',
            CurrentSpeed: '1',
        }
    },
    GetTransportSettings(inputs) {
        return {
            PlayMode: 'NORMAL',
            RecQualityMode: 'NOT_IMPLEMENTED',
        }
    },
    Next(inputs) {
        // do nothing
    },
    Pause(inputs) {
        fb2k.send('renderer:pause')
    },
    Play(inputs) {
        fb2k.send('renderer:play')
    },
    Previous(inputs) {
        // do nothing
    },
    Seek(inputs) {
        fb2k.send('renderer:seek', inputs.Target)
    },
    SetAVTransportURI(inputs) {
        const [, path, subsong] = inputs.CurrentURI.match(/\/decode\/(.+)\/subsong(\d+)\.\w+/) || [ ]
        if (inputs.CurrentURI.startsWith(baseUrl) && path && subsong) {
            const file = decodeURI(path).replace(/\//g, '\\').replace(/^file:\\\\/, 'file://')
            fb2k.send('renderer:load', file, parseInt(subsong))
        } else {
            fb2k.send('renderer:load', inputs.CurrentURI)
        }
    },
    SetNextAVTransportURI(inputs) {
        // do nothing
    },
    SetPlayMode(inputs) {
        // do nothing
    },
    Stop(inputs) {
        fb2k.send('renderer:pause')
        fb2k.send('renderer:seek', 0)
    },
})

const renderingControlImpletation = () => ({
    GetVolume(inputs) {
        return Math.floor(fb2k.send('renderer:volume') * 100) / 100
    },
    SetVolume(inputs) {
        const volume = parseInt(inputs.DesiredVolume) / 100
        if (volume >= 0) {
            fb2k.send('renderer:volume', volume)
        }
    },
})

const connectionManagerImpletation = () => ({
    GetProtocolInfo(inputs) {
        return {
            Source: 'http-get:*:*:*',
            Sink: '',
        }
    },
    GetCurrentConnectionIDs(inputs) {
        return {
            ConnectionIDs: '0',
        }
    },
    GetCurrentConnectionInfo(inputs) {
        return {
            RcsID: 0,
            AVTransportID: 0,
            ProtocolInfo: '',
            PeerConnectionManager: '',
            PeerConnectionID: -1,
            Direction: 'Input',
            Status: 'Unknown',
        }
    },
})

function createBrowseResult(array, baseUrl) {
    const root = elementTree.Element('DIDL-Lite', {
        'xmlns': 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/',
        'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        'xmlns:upnp': 'urn:schemas-upnp-org:metadata-1-0/upnp/',
        'xmlns:dlna': 'urn:schemas-dlna-org:metadata-1-0/',
    })
    array.forEach(item => {
        const elem = addSub(root, item.type, undefined, {
            id: item.id,
            parentID: item.id.split('/').slice(0, -1).join('/'),
            restricted: '1',
        })
        if (item.type === 'container') {
            elem.set('searchable', '0')
            addSub(elem, 'upnp:class', 'object.container')
            addSub(elem, 'dc:title', item.title)
            const path = encodeURI(item.latestItem.filePath.replace(/\\/g, '/')).replace('#', '%23')
            addSub(elem, 'upnp:albumArtURI',
                `${baseUrl}/albumart/${path}/cover${item.latestItem.subsong}.jpg`)
        } else if (item.type === 'item') {
            const path = encodeURI(item.filePath.replace(/\\/g, '/')).replace('#', '%23')
            addSub(elem, 'upnp:class', 'object.item.audioItem.musicTrack')
            addSub(elem, 'dc:title', item.title)
            addSub(elem, 'upnp:artist', item.artist)
            addSub(elem, 'upnp:artist', item.albumArtist, { role: 'AlbumArtist' })
            addSub(elem, 'upnp:albumArtURI', `${baseUrl}/albumart/${path}/cover${item.subsong}.jpg`)
            addSub(elem, 'upnp:album', item.album)
            addSub(elem, 'upnp:originalTrackNumber', item.trackNumber)
            const ext = (item.filePath.split('.').pop() || '').toLowerCase(),
                duration = sec2mmss(item.length),
                audioTypes =
                    ext === 'flac' ?
                        'flac:audio/flac,mp3:audio/mpeg,wav:audio/wav' :
                    ext === 'm4a' ?
                        'm4a:audio/mp4,wav:audio/wav,mp3:audio/mpeg' :
                    ext === 'wav' ?
                        'wav:audio/wav,mp3:audio/mpeg' :
                        'mp3:audio/mpeg,wav:audio/wav'
            for (const [ext, mime] of audioTypes.split(',').map(type => type.split(':'))) {
                addSub(elem, 'res', `${baseUrl}/decode/${path}/subsong${item.subsong}.${ext}`, {
                    duration,
                    protocolInfo: `http-get:*:${mime}:*`,
                })
            }
        }
    })
    return new elementTree.ElementTree(root).write({ xml_declaration: false })
}

const albumartRoute = koaRoute.get('/albumart/*', async (ctx, url, next) => {
    ctx.set('Access-Control-Allow-Origin', '*')

    let [, fpath, subsong, format] = url.match(/(.*)\/cover(\d+)\.(\w+)$/) || ['', url, 0, 'jpg']
    fpath = fpath.replace(/^file:\/\//, '').replace(/[\/\\]/g, path.sep)

    const root = path.dirname(__dirname),
        cacheUrl = path.join('albumart', url.replace(/^file:\/\//, '').replace(/:/g, '').replace('%23', '#')),
        cachePath = path.join(root, cacheUrl)
    if (await new Promise(resolve => fs.exists(cachePath, resolve))) {
        return await koaSend(ctx, cacheUrl, { root })
    }

    const albumart = fb2k.getAlbumart(fpath, parseInt(subsong))
    if (albumart) {
        const img = await jimp.read(albumart)
        await mkdirp(path.dirname(cachePath))
        await new Promise(resolve => img.resize(jimp.AUTO, 300).write(cachePath, resolve))
        return await koaSend(ctx, cacheUrl, { root })
    } else {
        const albumartPath = 'assets/thumbnail_default.png'
        return await koaSend(ctx, albumartPath, { root })
    }
})

async function decodeToMp3(ctx, fpath, subsong) {
    console.log('[decode:mp3:open]', fpath, 'subsong', subsong)
    const wav = new fb2k.Decoder(fpath, parseInt(subsong), 16),
        meta = wav.meta(),
        pass = new PassThrough(),
        mp3 = new lame.Encoder({
            channels: meta.channelCount,
            bitDepth: meta.bitDepth,
            sampleRate: meta.sampleRate,
            bitRate: parseInt(ctx.query.bitRate) || 320,
        })

    ctx.status = 200
    ctx.type = 'audio/mpeg'
    ctx.flushHeaders()

    pass.pipe(mp3).pipe(ctx.res)

    let hasError = false, cancelLast = () => 0
    ctx.onerror = () => (hasError = true) && cancelLast()

    let chunk, buffer = Buffer.from([ ])
    do {
        chunk = wav.decode()
        if (chunk) {
            buffer = Buffer.concat([buffer, chunk])
        }
        if (buffer.length > 1024 * 1024 || !chunk) {
            await new Promise(resolve => pass.write(buffer, cancelLast = resolve))
            buffer = Buffer.from([ ])
        }
    } while (chunk && !hasError && !ctx.res.finished)

    ctx.res.end()
    wav.destroy()
    console.log('[decode:mp3:close]', fpath, 'subsong', subsong)
}

async function decodeToWav(ctx, fpath, subsong) {
    console.log('[decode:wav:open]', fpath, 'subsong', subsong)
    const wav = new fb2k.Decoder(fpath, parseInt(subsong), 16)

    ctx.status = 200
    ctx.type = 'audio/wav'
    ctx.length = wav.length()
    ctx.flushHeaders()

    let hasError = false, cancelLast = () => 0
    ctx.onerror = () => (hasError = true) && cancelLast()

    let chunk = wav.header()
    while (chunk && !hasError && !ctx.res.finished) {
        await new Promise(resolve => ctx.res.write(chunk, cancelLast = resolve))
        chunk = wav.decode()
    }

    ctx.res.end()
    wav.destroy()
    console.log('[decode:wav:close]', fpath, 'subsong', subsong)
}

const decodeRoute = koaRoute.get('/decode/*', async (ctx, url) => {
    let [, fpath, subsong, format] = url.match(/(.*)\/subsong(\d+)\.(\w+)$/) || ['', url, 0, 'wav']
    fpath = fpath.replace(/^file:\/\//, '').replace(/[\/\\]/g, path.sep)
    if (!fs.existsSync(fpath)) {
        ctx.status = 404
        ctx.body = `file "${fpath}" not found`
        return
    }

    let ext = (fpath.split('.').pop() || '').toLowerCase()
    format = format.toLowerCase()
    if (format === ext && parseInt(subsong) === 0) {
        const [root, file] = [path.dirname(fpath), path.basename(fpath)]
        await koaSend(ctx, file, { root })
    } else if (format === 'wav') {
        await decodeToWav(ctx, fpath, subsong)
    } else if (format === 'mp3') {
        await decodeToMp3(ctx, fpath, subsong)
    } else {
        ctx.status = 403
        ctx.body = `unsupported encoding ${format}`
    }
})

const { gateway } = defaultGateway.v4.sync(),
    addr = Object.values(os.networkInterfaces())
        .map(addrs => addrs
            .filter(addr => addr.family === 'IPv4' && !addr.internal)
            .find(addr => new Netmask(addr.address, addr.netmask).contains(gateway)))
        .find(addr => addr),
    hostname = addr ? addr.address : os.hostname()

const app = new koa()
app.use(koaRange)
app.use(koaStatic(path.dirname(__dirname)))
app.use(albumartRoute)
app.use(decodeRoute)
app.listen(8092)

const server = http.createServer()
server.listen(8091, () => console.log(`upnp server started at ${hostname}:${8091}`))

const peer = upnp.createPeer({
    prefix: '/upnp',
    server,
    hostname,
}).start()

const baseUrl = `http://${hostname}:8092`,
    icons = [{ mimetype: 'image/png', width: 96, height: 96, depth: 24, url: `${baseUrl}/assets/icon.png` }],
    device = peer.createDevice(Object.assign(devOpts, { icons }))

const cdSrv = device.createService({
    domain: 'schemas-upnp-org',
    type: 'ContentDirectory',
    version: '1',
    implementation: contentDirectoryImpletation(baseUrl),
    description: contentDirectoryDescription,
})

const avSrv = device.createService({
    domain: 'schemas-upnp-org',
    type: 'AVTransport',
    version: '1',
    implementation: avTransportImpletation(),
    description: avTransportDescription,
    variables: {
        TransportState: 'string',
    },
})

const rcSrv = device.createService({
    domain: 'schemas-upnp-org',
    type: 'RenderingControl',
    version: '1',
    implementation: renderingControlImpletation(),
    description: renderingControlDescription,
})

const cmSrv = device.createService({
    domain: 'schemas-upnp-org',
    type: 'ConnectionManager',
    version: '1',
    implementation: connectionManagerImpletation(),
    description: connectionManagerDescription,
})

let TransportState = 'STOPPED'
fb2k.on('play:start', () => {
    avSrv.set('TransportState', TransportState = 'PLAYING')
    avSrv.notify('TransportState')
})
fb2k.on('play:pause', () => {
    avSrv.set('TransportState', TransportState = 'PAUSED_PLAYBACK')
    avSrv.notify('TransportState')
})
fb2k.on('play:ended', () => {
    avSrv.set('TransportState', TransportState = 'STOPPED')
    avSrv.notify('TransportState')
})

const dumpStart = Date.now(),
    list = fb2k.send('library:dump')
function updateItemPath(item) {
    item.path = item.filePath.substr(0, item.filePath.length - item.path.length - 1)
        .split('\\').pop() + '\\' + item.path
    return item
}
list.forEach(item => db.addMedia(updateItemPath(item)))
console.log(`synced ${list.length} item(s) with library (in ${(Date.now() - dumpStart) / 1000}s)`)

fb2k.on('library:add', ({ list }) => {
    list.forEach(item => db.addMedia(updateItemPath(item)))
    console.log(`added ${list.length} item(s) to library`)
})
fb2k.on('library:update', ({ list }) => {
    list.forEach(item => db.updateMedia(updateItemPath(item)))
    console.log(`updated ${list.length} item(s) in library`)
})
fb2k.on('library:remove', ({ list }) => {
    list.forEach(item => db.removeMedia(updateItemPath(item)))
    console.log(`removed ${list.length} item(s) from library`)
})
