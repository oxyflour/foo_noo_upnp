const http = require('http'),
    fsNode = require('fs'),
    path = require('path'),
    url = require('url'),
    { promisify } = require('util'),

    koa = require('koa'),
    koaStatic = require('koa-static'),
    koaRoute = require('koa-route'),
    koaBody = require('koa-bodyparser'),
    koaProxy = require('koa-better-http-proxy'),

    peerUpnp = require('peer-upnp'),
    elementTree = require('elementtree'),
    socketIO = require('socket.io'),
    mkdirp = require('mkdirp-promise'),

    db = require('../common/db'),
    { hhmmss2sec } = require('../common/utils')

const fs = {
    lstat: promisify(fsNode.lstat),
    exists: promisify(fsNode.exists),
    writeFile: promisify(fsNode.writeFile),
    readFile: promisify(fsNode.readFile),
    readdir: promisify(fsNode.readdir),
    unlink: promisify(fsNode.unlink),
}

function parseBrowseResult(result) {
    const list = [ ],
        doc = elementTree.parse(result),
        children = doc._root && doc._root._children || [ ]
    children.forEach(child => {
        const item = Object.assign({ }, child.attrib)
        item.resList = [ ]
        child._children.forEach(elem => {
            const key = elem.tag.replace(/:(\w)/g, (m, c) => c.toUpperCase())
            if (key === 'res') {
                const res = { url: elem.text }
                for (const attr in elem.attrib) {
                    res[attr] = elem.attrib[attr]
                }
                item.resList.push(res)
            } else if (elem.attrib.role) {
                item[key + elem.attrib.role] = elem.text
            } else {
                item[key] = elem.text
            }
        })
        list.push(item)
    })
    return list
}

function buildMetadata(metadata) {
    const didl = elementTree.Element('DIDL-Lite')
    didl.set('xmlns', 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/')
    didl.set('xmlns:dc', 'http://purl.org/dc/elements/1.1/')
    didl.set('xmlns:upnp', 'urn:schemas-upnp-org:metadata-1-0/upnp/')
    didl.set('xmlns:dlna', 'urn:schemas-dlna-org:metadata-1-0/')
    didl.set('xmlns:arib', 'urn:schemas-arib-or-jp:elements-1-0/')
    didl.set('xmlns:av', 'urn:schemas-sony-com:av')

    const item = elementTree.SubElement(didl, 'item')
    item.set('id', metadata.id)
    item.set('parentID', metadata.parentID)

    Object.assign(elementTree.SubElement(item, 'upnp:class'), { text: metadata.upnpClass })
    Object.assign(elementTree.SubElement(item, 'upnp:album'), { text: metadata.upnpAlbum })
    Object.assign(elementTree.SubElement(item, 'dc:title'), { text: metadata.dcTitle })
    Object.assign(elementTree.SubElement(item, 'dc:creator'), { text: metadata.dcCreator })
    Object.assign(elementTree.SubElement(item, 'upnp:albumArtURI'), { text: metadata.upnpAlbumArtURI })
    for (const res of metadata.resList || [ ]) {
        const elem = elementTree.SubElement(item, 'res')
        elem.set('protocolInfo', res.protocolInfo)
        elem.set('duration', res.duration)
        elem.text = res.url
    }

    const doc = new elementTree.ElementTree(didl)
    return doc.write({ xml_declaration: false })
}

const app = new koa()
app.use(koaStatic(path.dirname(__dirname)))
app.use(koaBody())

const server = http.createServer(app.callback())
server.listen(8090, async () => {
    console.log(`upnp client started at port ${8090}`)
    try {
        if (await fs.exists(playlistDir)) {
            await loadPlaylists(playlistDir)
        }
    } catch (err) {
        console.error('load playlists failed', err)
    }
})

const foundServices = { }
async function upnpCall(url, method, inputs) {
    if (!foundServices[url]) {
        return console.error(`service "${url}" not found when calling ${method}`)
    }
    const actions = await foundServices[url].parsedActions
    if (!actions[method]) {
        return console.error(`action "${method}" does not exists for ${url}`)
    }
    return await new Promise(resolve => actions[method](inputs, resolve))
}

const avState = { }
async function onUpnpStop(url) {
    const { playingTrack, playingQueue, playingInstanceID } = avState[url] || { }
    console.log(`renderer (${url}) stopped.`)
    if (Array.isArray(playingQueue)) {
        const index = playingQueue.findIndex(track => track.id === (playingTrack && playingTrack.id)),
            nextIndex = (index + 1) % playingQueue.length
            nextTrack = playingQueue[nextIndex]
        if (nextTrack) {
            console.log(`playing ${nextIndex} / ${playingQueue.length}`, nextTrack.id)
            await playNext(url, nextTrack, playingQueue)
        }
    }
}
async function playNext(url, playingTrack, playingQueue) {
    const { playingInstanceID } = avState[url] || { }
    await upnpCall(url, 'SetAVTransportURI', {
        InstanceID: playingInstanceID || 0,
        CurrentURI: playingTrack.resList[0].url,
        CurrentURIMetaData: buildMetadata(playingTrack),
    })
    await upnpCall(url, 'Play', {
        InstanceID: playingInstanceID || 0,
        Speed: 1,
    })
    const update = { playingTrack, playingQueue, playingState: { isPlaying: true } }
    io.to(url).emit('av-update', Object.assign(avState[url], update))
    startTimer(url)
}

const avTimers = { }
async function startTimer(url) {
    const deviceState = avTimers[url] || (avTimers[url] = { })
    clearTimeout(deviceState.timer)

    const { playingInstanceID } = avState[url] || { },
        { CurrentTransportState } = await upnpCall(url, 'GetTransportInfo', { InstanceID: playingInstanceID || 0 }) || { }
    if (CurrentTransportState !== deviceState.state) {
        deviceState.state = CurrentTransportState
        if (CurrentTransportState === 'STOPPED') {
            await onUpnpStop(url)
        }
    }

    let playingTime = 0
    if (CurrentTransportState === 'PLAYING') {
        const { RelTime } = await upnpCall(url, 'GetPositionInfo', { InstanceID: playingInstanceID || 0 }) || { }
        playingTime = hhmmss2sec(RelTime || '0')
        io.to(url).emit('av-update', { playingTime })
    }

    const rest = Math.floor(playingTime) + 1 - playingTime,
        timeout = rest < 0.1 ? rest + 1 : rest
    deviceState.timer = setTimeout(() => startTimer(url), timeout * 1000)
}
function stopTimer(url) {
    const deviceState = avTimers[url] || (avTimers[url] = { })
    clearTimeout(deviceState.timer)
}

const playlistDir = path.join(__dirname, '..', 'playlist')
async function loadPlaylists(dir) {
    for (const file of await fs.readdir(dir)) {
        const sub = path.join(dir, file),
            stat = await fs.lstat(sub)
        if (stat.isDirectory()) {
            await loadPlaylists(sub)
        } else {
            const list = JSON.parse(await fs.readFile(sub, 'utf8'))
            for (const item of list) {
                db.addMedia(item)
            }
        }
    }
}

app.use(koaRoute.post('/playlist/*', async (ctx, sub) => {
    const target = path.join(playlistDir, sub),
        list = [ ]
    await mkdirp(path.dirname(target))
    if (await fs.exists(target)) {
        for (const item of JSON.parse(await fs.readFile(target, 'utf8'))) {
            db.removeMedia(item)
        }
    }
    for (const { id } of ctx.request.body) {
        const item = Object.assign({ }, db.browseMeta(id))
        item.path = 'Playlists/' + sub + '/' + item.filePath.split('\\').pop()
        list.push(item)
        db.addMedia(item)
    }
    if (list.length) {
        await fs.writeFile(target, JSON.stringify(list, null, 2))
    } else {
        await fs.unlink(target)
    }
    ctx.response.body = { }
}))

app.use(koaRoute.post('/upnp/:method', async (ctx, method) => {
    const { url, inputs } = ctx.request.body
    ctx.response.body = await upnpCall(url, method, inputs)
}))

app.use(koaRoute.post('/upnp-content-directory/:method', async (ctx, method) => {
    const { url, inputs } = ctx.request.body,
        resp = await upnpCall(url, method, inputs)
    ctx.response.body = parseBrowseResult(resp && resp.Result || '')
}))

function getServiceInSameDevice(url, st) {
    const deviceURL = foundServices[url] && foundServices[url].device.descriptionUrl
    return Object.values(foundServices)
            .filter(service => service.serviceType === st)
            .find(service => service.device.descriptionUrl === deviceURL)
}

app.use(koaRoute.post('/upnp-avtransport/:method', async (ctx, method) => {
    const { url, inputs, update } = ctx.request.body,
        state = avState[url] || (avState[url] = { })
    if (method === 'Noop') {
        ctx.response.body = { }
    } else if (method === 'SetVolume' || method === 'GetVolume') {
        const controlService = getServiceInSameDevice(url, 'urn:schemas-upnp-org:service:RenderingControl:1')
        if (controlService) {
            ctx.response.body = await upnpCall(controlService.SCPDURL, method, inputs)
        }
    } else if (method === 'SetAVTransportURI') {
        const res = inputs.Metadata.resList[0]
        inputs.CurrentURI = res.url
        inputs.InstanceID = state.playingInstanceID || 0
        inputs.CurrentURIMetaData = buildMetadata(inputs.Metadata)
        delete inputs.Metadata
        ctx.response.body = await upnpCall(url, method, inputs)
    } else {
        if (method === 'Play') {
            startTimer(url)
        } else if (method === 'Pause') {
            stopTimer(url)
        }
        ctx.response.body = await upnpCall(url, method, inputs)
    }
    io.to(url).emit('av-update', Object.assign(state, update))
}))

app.use(koaRoute.get('/av-state/*', async (ctx, url) => {
    ctx.response.status = 200
    ctx.response.body = avState[url] || { }
}))

const io = socketIO(server)
io.on('connection', ws => {
    ws.on('upnp-sub', ({ url }) => ws.join(url))
    ws.on('upnp-unsub', ({ url }) => ws.leave(url))
})

function getServiceData(service) {
    const { SCPDURL, serviceType, device } = service,
        { icons, friendlyName, descriptionUrl } = device
    return { location: SCPDURL, st: serviceType, server: friendlyName, icons, descriptionUrl }
}

app.use(koaRoute.get('/ssdp-devices', async ctx => {
    ctx.response.status = 200
    ctx.response.body = Object.values(foundServices).map(getServiceData)
}))

function announceService(service) {
    console.log(`service ${service.SCPDURL} added`)
    foundServices[service.SCPDURL] = service
    io.emit('ssdp-update', Object.values(foundServices).map(getServiceData))
    service.parsedActions = new Promise(resolve => service.bind(resolve))
    service.on('disappear', () => {
        console.log(`service ${service.SCPDURL} removed`)
        delete foundServices[service.SCPDURL]
        io.emit('ssdp-update', Object.values(foundServices).map(getServiceData))
    })
}

const peer = peerUpnp.createPeer({
    prefix: '/upnp',
    server: http.createServer().listen(8089),
}).on('ready', async peer => {
    peer.on('urn:schemas-upnp-org:service:RenderingControl:1', announceService)
    peer.on('urn:schemas-upnp-org:service:AVTransport:1', announceService)
    peer.on('urn:schemas-upnp-org:service:ContentDirectory:1', announceService)
    peer.on('urn:schemas-upnp-org:service:ConnectionManager:1', announceService)
}).start()

app.use(koaRoute.get('/upnp-proxy/*', async (ctx, uri) => {
    const { host, path } = url.parse('http://' + uri.replace(/^\w:\/\//, '').replace('#', '%23')),
        decodedPath = decodeURI(path)
    console.log('proxying', host, decodedPath)
    await koaProxy(host, {
        proxyReqPathResolver: () => encodeURI(decodedPath),
        timeout: 30000,
        limit: '1024mb',
        parseReqBody: true,
    })(ctx)
}))
