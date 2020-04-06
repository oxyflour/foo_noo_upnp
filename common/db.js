const mediaReference = { },
    mediaListStore = { },
    mediaIdCache = { }

let searchCache = { }

function addMedia(item) {
    const itemId = item.path.replace(/\\/g, '/') + '?' + item.subsong
        id = mediaIdCache[item.path + '?' + item.filePath + '?' + item.subsong] = itemId,
        path = id.split('/')
    mediaListStore[id] = Object.assign({ type: 'item', id }, item)
    path.forEach((name, index) => {
        const dirPath = path.slice(0, index).join('/') || '0',
            dirRef = mediaReference[dirPath] || (mediaReference[dirPath] = { }),
            subPath = path.slice(0, index + 1).join('/'),
            subArray = dirRef[subPath] || (dirRef[subPath] = [ ])
        subArray.push(id)
        const dirMeta = mediaListStore[dirPath] || (mediaListStore[dirPath] = { })
        Object.assign(dirMeta, {
            type: 'container',
            id: dirPath,
            title: path[index - 1] || 'root',
            latestItem: dirMeta.time > item.time ? dirMeta.latestItem : item,
            time: Math.max(item.time, dirMeta.time || 0),
        })
    })
    searchCache = { }
}

function removeMedia(item) {
    const id = mediaIdCache[item.path + '?' + item.filePath + '?' + item.subsong],
        path = id.split('/')
    delete mediaListStore[id]
    path.forEach((name, index) => {
        const dirPath = path.slice(0, index).join('/') || '0',
            dirRef = mediaReference[dirPath] || (mediaReference[dirPath] = { }),
            subPath = path.slice(0, index + 1).join('/'),
            subArray = dirRef[subPath] || [ ]
        dirRef[subPath] = subArray.filter(i => i !== id)
        if (!dirRef[subPath].length) {
            delete dirRef[subPath]
        }
    })
    searchCache = { }
}

function updateMedia(item) {
    const id = mediaIdCache[item.path + '?' + item.filePath + '?' + item.subsong]
    mediaListStore[id] = Object.assign({ type: 'item', id }, item)
    searchCache = { }
}

function browseMeta(id) {
    return mediaListStore[id]
}

function browseChild(id) {
    return Object.keys(mediaReference[id] || { }).map(id => mediaListStore[id])
}

function checkKeyword(item, keyword) {
    return Object.keys(item).some(key => (item[key] + '').toLowerCase().includes(keyword))
}

function searchItems(id, keyword) {
    keyword = keyword.toLowerCase()
    const cacheKey = id + ':cache:' + keyword
    return searchCache[cacheKey] || (searchCache[cacheKey] = Object.values(mediaReference[id] || { })
        .reduce((arr, ids) => arr.concat(ids), [ ])
        .map(id => mediaListStore[id])
        .filter(item => item)
        .filter(item => !keyword || checkKeyword(item, keyword)))
}

module.exports = { addMedia, removeMedia, updateMedia, browseChild, browseMeta, searchItems }