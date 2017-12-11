const http = require('http'),
    fs = require('fs'),
    path = require('path'),
    url = require('url'),

    koa = require('koa'),
    koaStatic = require('koa-static'),
    koaRoute = require('koa-route'),
    koaBody = require('koa-bodyparser'),

    peerUpnp = require('peer-upnp'),
    elementTree = require('elementtree'),
    socketIO = require('socket.io'),
    ssdp = require('node-ssdp'),
    { hhmmss2sec } = require('../common/utils')

function parseBrowseResult(result) {
    const list = [ ],
        doc = elementTree.parse(result),
        children = doc._root._children || [ ]
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
    didl.set('xmlns:sec', 'http://www.sec.co.kr/')

    const item = elementTree.SubElement(didl, 'item')
    item.set('id', 0)
    item.set('parentID', -1)
    item.set('restricted', false)

    const OBJECT_CLASSES = {
        'audio': 'object.item.audioItem.musicTrack',
        'video': 'object.item.videoItem.movie',
        'image': 'object.item.imageItem.photo'
    }

    if (metadata.type) {
        const klass = elementTree.SubElement(item, 'upnp:class')
        klass.text = OBJECT_CLASSES[metadata.type]
    }

    if (metadata.title) {
        const title = elementTree.SubElement(item, 'dc:title')
        title.text = metadata.title
    }

    if (metadata.creator) {
        const creator = elementTree.SubElement(item, 'dc:creator')
        creator.text = metadata.creator
    }

    if (metadata.resList && metadata.resList) {
        for (const res of metadata.resList) {
            const elem = elementTree.SubElement(item, 'res')
            elem.set('protocolInfo', res.protocolInfo)
            elem.text = res.url
        }
    }

    const doc = new elementTree.ElementTree(didl),
        xml = doc.write({ xml_declaration: false })
    return xml
}

const app = new koa()
app.use(koaStatic(path.dirname(__dirname)))
app.use(koaBody())

const server = http.createServer(app.callback())
server.listen(8090, () => console.log(`upnp client started at port ${8090}`))

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
    const { playingTrack, playingQueue, playingInstanceID } = avState[url] || { },
        result = await upnpCall(url, 'GetPositionInfo', { InstanceID: playingInstanceID || 0 })
    console.log(`renderer (${url}) stopped.`, result.RelTime)
    if (hhmmss2sec(result.RelTime) === 0 && playingTrack && Array.isArray(playingQueue)) {
        const index = playingQueue.findIndex(track => track.id === playingTrack.id),
            nextIndex = (index + 1) % playingQueue.length
            nextTrack = playingQueue[nextIndex]
        if (nextTrack) {
            console.log(`playing ${nextIndex} / ${playingQueue.length}`, nextTrack.id)
            await playNext(url, playingInstanceID, nextTrack, playingQueue)
        }
    }
}
async function playNext(url, ins, playingTrack, playingQueue) {
    await upnpCall(url, 'SetAVTransportURI', {
        InstanceID: ins,
        CurrentURI: playingTrack.resList[0].url,
        CurrentURIMetaData: buildMetadata(playingTrack),
    })
    await upnpCall(url, 'Play', {
        InstanceID: ins,
        Speed: 1,
    })
    const update = { playingTrack, playingQueue, playingState: { isPlaying: true } }
    io.to(url).emit('av-update', Object.assign(avState[url], update))
}

app.use(koaRoute.post('/upnp/:method', async (ctx, method) => {
    const { url, inputs } = ctx.request.body
    ctx.response.body = await upnpCall(url, method, inputs)
}))

app.use(koaRoute.post('/upnp-content-directory/:method', async (ctx, method) => {
    const { url, inputs } = ctx.request.body,
        resp = await upnpCall(url, method, inputs)
    ctx.response.body = resp && parseBrowseResult(resp.Result)
}))

app.use(koaRoute.post('/upnp-avtransport/:method', async (ctx, method) => {
    const { url, inputs, update } = ctx.request.body
    if (method === 'SetVolume' || method === 'GetVolume') {
        const services = Object.values(foundServices),
            rendererService = services
                .filter(service => service.serviceType === 'urn:schemas-upnp-org:service:AVTransport:1')
                .find(service => service.SCPDURL === url),
            controlService = services
                .filter(service => service.serviceType === 'urn:schemas-upnp-org:service:RenderingControl:1')
                .find(service => service.device.descriptionUrl === (rendererService && rendererService.device.descriptionUrl))
        if (controlService) {
            ctx.response.body = await upnpCall(controlService.SCPDURL, method, inputs)
        }
    } else {
        if (method === 'SetAVTransportURI') {
            inputs.CurrentURI = inputs.resList[0].url
            inputs.CurrentURIMetaData = buildMetadata(inputs)
        }
        ctx.response.body = await upnpCall(url, method, inputs)
    }
    const state = avState[url] || (avState[url] = { })
    io.to(url).emit('av-update', Object.assign(state, update))
}))

async function upnpSub(url) {
    const service = foundServices[url]
    if (!service) {
        return console.error(`service ${url} not found when subscribing`)
    } else if (!service.subscribed) {
        service.on('event', data => {
            // we have to parse this manually
            if (data.LastChange) {
                const evt = elementTree.parse(data.LastChange)
                ;(evt._root || [ ])._children.forEach(child => {
                    (child._children || [ ]).forEach(item => {
                        data[item.tag] = item.attrib.val
                    })
                })
            }
            io.to(url).emit('upnp-recv', { data })
            if (data.TransportState === 'STOPPED') {
                onUpnpStop(url)
            }
        })
        service.subscribed = true
    }
}

const io = socketIO(server)
io.on('connection', ws => {
    ws.on('upnp-sub', ({ url }, cb) => {
        ws.join(url)
        upnpSub(url)
        cb && cb(avState[url] || { })
    })
    ws.on('upnp-unsub', ({ url }, cb) => {
        ws.leave(url)
    })
    ws.on('av-pos', async ({ url, ins }, cb) => {
        const result = await upnpCall(url, 'GetPositionInfo', { InstanceID: ins })
        cb(hhmmss2sec(result.RelTime || '0'))
    })
})

function getServiceData(service) {
    const { SCPDURL, serviceType, device } = service,
        { icons, friendlyName, descriptionUrl } = device
    return { location: SCPDURL, st: serviceType, server: friendlyName, icons, descriptionUrl }
}

app.use(koaRoute.get('/devices', async (ctx) => {
    ctx.response.status = 200
    ctx.response.body = Object.values(foundServices).map(getServiceData)
}))

function announceService(service) {
    console.log(`service ${service.SCPDURL} added`)
    io.emit('ssdp-found', getServiceData(foundServices[service.SCPDURL] = service))
    service.parsedActions = new Promise(resolve => service.bind(resolve))
    service.on('disappear', () => {
        console.log(`service ${service.SCPDURL} removed`)
        io.emit('ssdp-disappear', service.SCPDURL)
        delete foundServices[service.SCPDURL]
    })
}

const peer = peerUpnp.createPeer({
    prefix: '/upnp',
    server: http.createServer().listen(8089),
}).on('ready', async peer => {
    peer.on('urn:schemas-upnp-org:service:RenderingControl:1', announceService)
    peer.on('urn:schemas-upnp-org:service:AVTransport:1', announceService)
    peer.on('urn:schemas-upnp-org:service:ContentDirectory:1', announceService)
}).start()
