const http = require('http'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    upnp = require('peer-upnp'),
    elementTree = require('elementtree'),
    xmlEscape = require('xml-escape'),
    jimp = require('jimp'),

    koa = require('koa'),
    koaSend = require('koa-send'),
    koaRoute = require('koa-route'),
    mkdirp = require('mkdirp-promise'),

    db = require('../common/db'),
    { sec2mmss } = require('../common/utils'),
    { devOpts, contentDirectoryDescription, avTransportDescription } = require('../common/upnp')

function addSub(elem, tag, text, attrs) {
    attrs && Object.keys(attrs).forEach(key => attrs[key] = xmlEscape(attrs[key]))
    return Object.assign(new elementTree.SubElement(elem, tag, attrs), { text: xmlEscape(text) })
}

const SORT_CAPS = {
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
            UpdateID: '',
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
            UpdateID: '',
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
            CurrentTransportState: [
                'STOPPED',
                'PAUSED_PLAYBACK',
                'PAUSED_RECORDING',
                'PLAYING',
                'RECORDING',
                'TRANSITIONING',
                'NO_MEDIA_PRESENT',
            ][0],
            CurrentTransportStatus: [
                'OK',
                'ERROR_OCCURRED',
                'vendor-defined',
            ][0],
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
            const path = encodeURI(item.latestItem.filePath.replace(/\\/g, '/'))
            addSub(elem, 'upnp:albumArtURI',
                `${baseUrl}/albumart/${path}/cover${item.latestItem.subsong}.jpg`)
        } else if (item.type === 'item') {
            const path = encodeURI(item.filePath.replace(/\\/g, '/'))
            addSub(elem, 'upnp:class', 'object.item.audioItem.musicTrack')
            addSub(elem, 'dc:title', item.title)
            addSub(elem, 'upnp:artist', item.artist)
            addSub(elem, 'upnp:artist', item.albumArtist, { role: 'AlbumArtist' })
            addSub(elem, 'upnp:albumArtURI', `${baseUrl}/albumart/${path}/cover${item.subsong}.jpg`)
            addSub(elem, 'upnp:album', item.album)
            addSub(elem, 'upnp:originalTrackNumber', item.trackNumber)
            addSub(elem, 'res', `${baseUrl}/decode/${path}/subsong${item.subsong}.wav`, {
                duration: sec2mmss(item.length),
                protocolInfo: 'http-get:*:audio/wav',
            })
        }
    })
    return new elementTree.ElementTree(root).write({ xml_declaration: false })
}

const albumartRoute = koaRoute.get('/albumart/*', async (ctx, url, next) => {
    ctx.set('Access-Control-Allow-Origin', '*')

    let [, fpath, subsong, format] = url.match(/(.*)\/cover(\d+)\.(\w+)$/) || ['', url, 0, 'jpg']
    fpath = fpath.replace(/^file:\/\//, '').replace(/[\/\\]/g, path.sep)

    const root = path.dirname(__dirname),
        cacheUrl = path.join('albumart', url.replace(/^file:\/\//, '').replace(/:/g, '')),
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

async function decodeToWav(ctx, fpath, subsong) {
    console.log('[decode:open]', fpath, 'subsong', subsong)
    const wav = new fb2k.Decoder(fpath, parseInt(subsong), 16)

    ctx.status = 200
    ctx.type = 'audio/wav'
    ctx.length = wav.length()
    ctx.flushHeaders()

    let hasError = false, cancelLast = () => 0
    ctx.onerror = () => {
        hasError = true
        cancelLast()
    }

    let chunk = wav.header()
    while (chunk && !hasError && !ctx.res.finished) {
        await new Promise(resolve => ctx.res.write(chunk, cancelLast = resolve))
        chunk = wav.decode()
    }

    ctx.res.end()
    wav.destroy()
    console.log('[decode:close]', fpath, 'subsong', subsong)
}

const decodeRoute = koaRoute.get('/decode/*', async (ctx, url) => {
    let [, fpath, subsong, format] = url.match(/(.*)\/subsong(\d+)\.(\w+)$/) || ['', url, 0, 'wav']
    fpath = fpath.replace(/^file:\/\//, '').replace(/[\/\\]/g, path.sep)
    if (!fs.existsSync(fpath)) {
        ctx.status = 404
        ctx.body = `file "${fpath}" not found`
        return
    }

    format = format.toLowerCase()
    if (format === 'wav') {
        await decodeToWav(ctx, fpath, subsong)
    } else if (format === 'flac') {
    } else {
        ctx.status = 403
        ctx.body = `unsupported encoding ${format}`
    }
})

const app = new koa()
app.use(albumartRoute)
app.use(decodeRoute)
app.listen(8092)

const server = http.createServer()
server.listen(8091, () => console.log(`upnp started at port ${8091}`))

const peer = upnp.createPeer({
    prefix: '/upnp',
    server,
}).start()

const ip = Object.values(os.networkInterfaces())
        .map(infs => infs.find(inf => !inf.internal && inf.family === 'IPv4'))
        .filter(inf => inf)
        .map(inf => inf.address).pop(),
    baseUrl = `http://${ip}:8092`,
    device = peer.createDevice(devOpts)

const cdSrv = device.createService({
    domain: 'schemas-upnp-org',
    type: 'ContentDirectory',
    version: '1',
    implementation: contentDirectoryImpletation(baseUrl),
    description: contentDirectoryDescription,
})

const avSrv =  device.createService({
    domain: 'schemas-upnp-org',
    type: 'AVTransport',
    version: '1',
    implementation: avTransportImpletation(),
    description: avTransportDescription,
    variables: {
        TransportState: 'string',
    },
})

fb2k.on('play:start', () => {
    avSrv.set('TransportState', 'PLAYING')
    avSrv.notify('TransportState')
})
fb2k.on('play:pause', () => {
    avSrv.set('TransportState', 'PAUSED_PLAYBACK')
    avSrv.notify('TransportState')
})
fb2k.on('play:ended', () => {
    avSrv.set('TransportState', 'STOPPED')
    avSrv.notify('TransportState')
})

const dumpStart = Date.now(),
    list = fb2k.send('library:dump')
list.forEach(item => db.addMedia(item))
console.log(`synced ${list.length} item(s) with library (in ${(Date.now() - dumpStart) / 1000}s)`)

fb2k.on('library:add', ({ list }) => {
    list.forEach(item => db.addMedia(item))
    console.log(`added ${list.length} item(s) to library`)
})
fb2k.on('library:update', ({ list }) => {
    list.forEach(item => db.updateMedia(item))
    console.log(`updated ${list.length} item(s) in library`)
})
fb2k.on('library:remove', ({ list }) => {
    list.forEach(item => db.removeMedia(item))
    console.log(`removed ${list.length} item(s) from library`)
})
