function qsParse(queryString) {
    const queryMap = { }
    queryString.split('&')
        .map(pair => pair.split('='))
        .forEach(([key, value]) => queryMap[key] = decodeURIComponent(value))
    return queryMap
}

function qsJoin(queryMap) {
    return Object.keys(queryMap)
        .map(key => `${key}=${encodeURIComponent(queryMap[key])}`)
        .join('&')
}

function qsSet(url, key, value) {
    const split = url.split('?'),
        queryString = split.pop(),
        queryMap = qsParse(queryString)
    queryMap[key] = value
    return split.concat(qsJoin(queryMap)).join('?')
}

function hhmmss2sec(hhmmss) {
    const st = hhmmss.split(':').map(parseFloat),
        s = st.pop() || 0,
        m = st.pop() || 0,
        h = st.pop() || 0
    return h * 60 * 60 + m * 60 + s
}

function sec2mmss(sec) {
    sec = Math.floor(sec)
    return Math.floor(sec / 60) + ':' + (Math.floor(sec) % 60 + 100 + '').slice(-2)
}

function debounce(fn, time) {
    let timeout
    return function(...args) {
        if (timeout) {
            clearTimeout(timeout)
        }
        timeout = setTimeout(() => {
            timeout = 0
            fn.apply(this, args)
        }, time)
    }
}

function throttle(fn, time) {
    let timeout
    return function() {
        if (timeout) {
            return
        }
        timeout = setTimeout(() => {
            timeout = 0
            fn.apply(this, arguments)
        }, time)
    }
}

async function fetchJson(url, body) {
    const resp = await fetch(url, {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
        method: body ? 'POST' : 'GET',
        body: body && JSON.stringify(body),
    })
    return await resp.json()
}

function cssStyleUrl(url) {
    return url.replace(/[\(\) ']/g, m => '\\' + m)
}

function onChange(fn, last) {
    return (val) => {
        if (val !== last) {
            fn(val, last)
            last = val
        }
    }
}

function proxyURL(src) {
    return 'upnp-proxy/' + encodeURI((src + '').replace(/^\w+:\/\//, ''))
}

function albumartURL(src) {
    return cssStyleUrl(src ? proxyURL(src) : 'assets/thumbnail_default.png') 
}

module.exports = { qsSet, debounce, throttle, sec2mmss, hhmmss2sec, cssStyleUrl, fetchJson, onChange, proxyURL, albumartURL }
