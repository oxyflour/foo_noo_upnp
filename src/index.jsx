import 'babel-polyfill'
import * as url from 'url'
import * as React from 'react'
import * as ReactDOM from 'react-dom'

import AppBar from 'material-ui/AppBar'
import Toolbar from 'material-ui/Toolbar'
import Typography from 'material-ui/Typography'
import Button from 'material-ui/Button'
import List, { ListItem, ListItemIcon, ListItemText } from 'material-ui/List'
import IconButton from 'material-ui/IconButton'
import Drawer from 'material-ui/Drawer'
import Divider from 'material-ui/Divider'
import TextField from 'material-ui/TextField'

import Delete from 'material-ui-icons/Delete'
import KeyboardArrowLeft from 'material-ui-icons/KeyboardArrowLeft'
import Drafts from 'material-ui-icons/Drafts'
import Mail from 'material-ui-icons/Mail'
import Report from 'material-ui-icons/Report'
import Send from 'material-ui-icons/Send'
import Star from 'material-ui-icons/Star'
import Menu from 'material-ui-icons/Menu'
import Info from 'material-ui-icons/Info'
import Search from 'material-ui-icons/Search'
import Close from 'material-ui-icons/Close'
import LibraryMusic from 'material-ui-icons/LibraryMusic'
import Phonelink from 'material-ui-icons/Phonelink'
import SurroundSound from 'material-ui-icons/SurroundSound'
import SkipPrevious from 'material-ui-icons/SkipPrevious'
import SkipNext from 'material-ui-icons/SkipNext'
import PlayCircleOutline from 'material-ui-icons/PlayCircleOutline'
import PauseCircleOutline from 'material-ui-icons/PauseCircleOutline'
import PlaylistPlay from 'material-ui-icons/PlaylistPlay'
import MoreVert from 'material-ui-icons/MoreVert'

import { HashRouter, Route, Redirect, Switch } from 'react-router-dom'

import './index.less'

import Select from '../components/Select.jsx'
import { default as Browser, getTitleMain } from '../components/Browser.jsx'
import { qsSet, fetchJson, debounce, hhmmss2sec, cssStyleUrl, onChange } from '../common/utils'

const SORT_DISPLAY_NAME = {
    'res@duration': 'Duration',
    'res@size': 'Size',
    'res@bitrate': 'Bitrate',
}

function updateSortCriteria(sortCriteria, field) {
    const sortCriteriaArray = sortCriteria.split(',').filter(x => x),
        index = sortCriteriaArray.findIndex(key => key.slice(1) === field)
    if (index === -1) {
        sortCriteriaArray.unshift('-' + field)
    } else if (sortCriteriaArray[index][0] === '-') {
        sortCriteriaArray.splice(index, 1)
        sortCriteriaArray.unshift('+' + field)
    } else {
        sortCriteriaArray.splice(index, 1)
    }
    return sortCriteriaArray.join(',')
}

const upnp = {
    async getSortCapabilities(browserLocation) {
        try {
            const result = await fetchJson('/upnp/GetSortCapabilities', {
                url: browserLocation,
                inputs: { }
            })
            return (result.SortCaps || '').split(',')
        } catch (err) {
            console.error(`GetSortCriteria seems not implemented by ${browserLocation}`, err)
            return [ ]
        }
    },
}

class Main extends React.Component {
    ws = io()
    addDevice(dev) {
        const { location } = dev,
            { browsers, renderers } = this.state
        dev.url = url.parse(dev.location)
        if (dev.st === 'urn:schemas-upnp-org:service:ContentDirectory:1') {
            const found = browsers.find(dev => dev.location === location)
            if (!found) this.setState({ browsers: browsers.concat(dev) })
        }
        else if (dev.st === 'urn:schemas-upnp-org:service:AVTransport:1') {
            const found = renderers.find(dev => dev.location === location)
            if (!found) this.setState({ renderers: renderers.concat(dev) })
        }
    }
    removeDevice(dev) {
        const { location } = dev,
            browsers = this.state.browsers.filter(dev => dev.location !== location),
            renderers = this.state.renderers.filter(dev => dev.location !== location)
        this.setState({ browsers, renderers })
    }
    updateDrawer() {
        const isDrawerDocked = window.innerWidth > 768,
            drawerWidth = isDrawerDocked ? 
                Math.min(window.innerWidth * 0.3, 320) :
                Math.min(window.innerWidth * 0.8, 320)
        this.setState({ isDrawerDocked, drawerWidth })
    }
    updatePlayer({ data }) {
        if (data.TransportState === 'PLAYING') {
            this.setState({ playingState: { isPlaying: true } })
        } else if (data.TransportState === 'PAUSED_PLAYBACK') {
            this.setState({ playingState: { isPaused: true } })
        } else if (data.TransportState === 'STOPPED') {
            this.setState({ playingState: { isStopped: true } })
        }
    }

    tickTimeout = 0
    async onTick() {
        clearTimeout(this.tickTimeout)
        const playingTime = this.state.playingState.isPlaying ? await this.getPosition() : this.state.playingTime,
            rest = Math.floor(playingTime) + 1 - playingTime,
            timeout = rest < 0.1 ? rest + 1 : rest
        this.tickTimeout = setTimeout(() => this.onTick(), timeout * 1000)
        this.setState({ playingTime })
    }

    audio = new Audio()
    async playNext(delta = 1) {
        const { playingTrack, playingQueue, playingLocation, playingPath } = this.state
        if (playingTrack && Array.isArray(playingQueue)) {
            const index = playingQueue.findIndex(track => track.id === playingTrack.id),
                nextIndex = (index + playingQueue.length + delta) % playingQueue.length,
                nextTrack = playingQueue[nextIndex]
            if (nextTrack) {
                await this.load(nextTrack, playingLocation, playingPath, playingQueue)
                await this.play()
            }
        }
    }
    async playPauseTrack(track, location, path, queue) {
        const { playingTrack, playingState } = this.state
        if (track.id === playingTrack.id) {
            if (playingState.isPlaying) {
                await this.pause()
            } else {
                await this.play()
            }
        } else {
            await this.load(track, location, path, queue)
            await this.play()
        }
    }
    async load(playingTrack, playingLocation, playingPath, playingQueue) {
        if (playingTrack) {
            this.audio.pause()
            this.audio.childNodes.forEach(source => source.parentNode.removeChild(source))
            this.audio = new Audio()
            this.audio.addEventListener('ended', () => this.playNext())
            for (const type in playingTrack.allRes || { }) {
                const source = document.createElement('source')
                source.type = type
                source.src = playingTrack.allRes[type]
                this.audio.appendChild(source)
            }
            this.audio.load()
        }
        const { rendererLocation, playingInstanceID } = this.state
        if (rendererLocation) {
            await fetchJson('/upnp-avtransport/SetAVTransportURI', {
                url: rendererLocation,
                inputs: {
                    InstanceID: playingInstanceID,
                    CurrentURI: playingTrack.res.url,
                    res: playingTrack.res,
                },
                update: { playingTrack, playingLocation, playingPath, playingQueue, playingInstanceID },
            })
        } else {
            this.setState({ playingTrack, playingLocation, playingPath, playingQueue, playingInstanceID })
        }
    }
    async play() {
        const { rendererLocation, playingInstanceID } = this.state
        if (rendererLocation) {
            await fetchJson('/upnp-avtransport/Play', {
                url: rendererLocation,
                inputs: {
                    InstanceID: playingInstanceID,
                    Speed: 1,
                },
                update: { playingState: { isPlaying: true } },
            })
        } else {
            this.audio.play()
            this.setState({ playingState: { isPlaying: true } })
        }
    }
    async pause() {
        const { rendererLocation, playingInstanceID } = this.state
        if (rendererLocation) {
            await fetchJson('/upnp-avtransport/Pause', {
                url: rendererLocation,
                inputs: {
                    InstanceID: playingInstanceID,
                },
                update: { playingState: { isPaused: true } },
            })
        } else {
            this.audio.pause()
            this.setState({ playingState: { isPaused: true } })
        }
    }
    async stop() {
        const { rendererLocation, playingInstanceID } = this.state
        if (rendererLocation) {
            await fetchJson('/upnp-avtransport/Stop', {
                url: rendererLocation,
                inputs: {
                    InstanceID: playingInstanceID,
                },
                update: { playingState: { isStopped: true } },
            })
        } else {
            this.audio.pause()
            this.audio.currentTime = 0
            this.setState({ playingState: { isStopped: true } })
        }
    }

    async getPosition() {
        const { rendererLocation, playingInstanceID } = this.state
        if (rendererLocation) {
            const url = rendererLocation,
                ins = playingInstanceID
            return await new Promise((resolve, reject) => {
                setTimeout(reject, 30000)
                this.ws.emit('av-pos', { url, ins }, resolve)
            })
        } else {
            return this.audio.currentTime
        }
    }
    beginSearch() {
        const { searchKeyword } = this.state,
            { pathname } = this.props.location
        if (searchKeyword) {
            const path = pathname.replace(/\/~\/.*/, '').replace(/\/$/, '') + '/~/' + searchKeyword
            this.props.history.push(path)
        }
        this.setState({ searchKeyword: '', isSearchShown: false })
    }

    state = {
        renderers: [ ],
        browsers: [ ],

        isDrawerOpen: false,
        isDrawerDocked: false,
        drawerWidth: 0,

        isSearchShown: false,
        searchKeyword: '',

        rendererLocation: localStorage.getItem('main-renderer-location') || '',
        playingTrack: { },
        playingTime: 0,
        playingState: { isStopped: true },
        playingLocation: '',
        playingPath: '',
        playingQueue: [ ],
        playingInstanceID: 0,

        albumartSwatches: { },

        sortCaps: [ ],
    }
    async componentDidMount() {
        const devices = await fetchJson('/devices')
        devices.forEach(dev => this.addDevice(dev))
        this.ws.on('ssdp-found', dev => this.addDevice(dev))
        this.ws.on('ssdp-disappear', dev => this.removeDevice(dev))
        // this.ws.on('upnp-recv', evt => this.updatePlayer(evt))
        this.ws.on('av-update', update => this.setState(update))
        this.updateDrawer()
        window.addEventListener('resize', debounce(() => this.updateDrawer(), 200))
        this.onTick()
    }
    renderOutputSelector() {
        const { rendererLocation, renderers } = this.state
        return <Select title="Select Output"
            value={ rendererLocation }
            onChange={ rendererLocation => this.setState({ rendererLocation }) }
            options={
                [{
                    primary: 'Browser',
                    secondary: 'output',
                    value: ''
                }].concat(renderers.map(dev => ({
                    primary: dev.server,
                    secondary: dev.url.host,
                    value: dev.location,
                })))
            }
            render={
                (selected, onClick) => <ListItem button onClick={ onClick }>
                    <ListItemIcon>
                        { selected && selected.value ? <Phonelink /> : <SurroundSound /> }
                    </ListItemIcon>
                    <ListItemText
                        primary={ selected ? selected.primary : 'Select Output' }
                        secondary={ selected && selected.secondary } />
                </ListItem>
            }>
        </Select>
    }
    renderBrowserSelector() {
        const { browsers } = this.state
        return <Select title="Select Music Library"
            value={ (this.props.location.pathname.match(/\/browse\/([^\/]+)\//) || ['', '']).pop() }
            onChange={ host => this.props.history.push(`/browse/${host}/`) }
            options={
                browsers.map(dev => ({
                    primary: dev.server,
                    secondary: dev.url.host,
                    value: dev.url.host,
                }))
            }
            render={
                (selected, onClick) => <ListItem button onClick={ onClick }>
                    <ListItemIcon><LibraryMusic /></ListItemIcon>
                    <ListItemText
                        primary={ selected ? selected.primary : 'Select Library' }
                        secondary={ selected && selected.secondary } />
                </ListItem>
            }>
        </Select>
    }
    renderAppBar() {
        const { isDrawerDocked, drawerWidth } = this.state
        return <AppBar className="appbar" style={{
            marginLeft: isDrawerDocked ? drawerWidth : 0,
            width: isDrawerDocked ? `calc(100% - ${drawerWidth}px)` : '100%',
        }} color="default">
            <Switch>
                <Route path="/browse/:host/(.*)"
                    render={ props => this.renderBrowserToolbar(props.match.params.host, props.match.params[0]) }></Route>
                <Route
                    render={ props => this.renderTitledToolbar('Foo Noo') }></Route>
            </Switch>
        </AppBar>
    }
    renderTitledToolbar(title) {
        return <Toolbar>
            <IconButton onClick={ () => this.setState({ isDrawerOpen: !this.state.isDrawerOpen }) }>
                <Menu />
            </IconButton>
            <Typography className="title" type="title" style={{ flex: 1 }}>
                { title }
            </Typography>
        </Toolbar>
    }
    renderBrowserToolbar(host, path) {
        const { renderers, browsers, isDrawerDocked, drawerWidth, isSearchShown, searchKeyword } = this.state,
            pathSplit = path ? path.split('/') : [ ],
            [parentPath, folderName] = [pathSplit.slice(0, -1).join('/'), pathSplit.slice(-1).pop() || 'Root']
        return isDrawerDocked ? <Toolbar>
            <Typography className="title" type="title" style={{ flex: 1 }}>
                {
                    [''].concat(pathSplit).map((dirname, index) => <span key={ index }>
                        { index > 0 && '/' }
                        <Button
                            onClick={ () => this.props.history.push(`/browse/${host}/${pathSplit.slice(0, index).join('/')}`) }>
                            { getTitleMain(dirname) || 'Root' }
                        </Button>
                    </span>)
                }
            </Typography>
            {
                isSearchShown ?
                    <TextField placeholder="Search..."
                        style={{ marginLeft: 16 }}
                        autoFocus={ true }
                        value={ searchKeyword }
                        onBlur={ () => this.setState({ isSearchShown: false }) }
                        onChange={ evt => this.setState({ searchKeyword: evt.target.value }) }
                        onKeyDown={ evt => evt.which === 13 && this.beginSearch() }>
                    </TextField> :
                    <IconButton onClick={ () => this.setState({ isSearchShown: true }) }>
                        <Search />
                    </IconButton>
            }
        </Toolbar> : isSearchShown ?
        <Toolbar>
            <TextField placeholder="Search..."
                style={{ marginLeft: 16 }}
                fullWidth={ true }
                autoFocus={ true }
                value={ searchKeyword }
                onBlur={ () => this.setState({ isSearchShown: false }) }
                onChange={ evt => this.setState({ searchKeyword: evt.target.value }) }
                onKeyDown={ evt => evt.which === 13 && this.beginSearch() }>
            </TextField>
            <IconButton onClick={ () => this.setState({ isSearchShown: false }) }>
                <Close />
            </IconButton>
        </Toolbar> :
        <Toolbar>
            <IconButton onClick={ () => this.setState({ isDrawerOpen: !this.state.isDrawerOpen }) }>
                <Menu />
            </IconButton>
            <Typography className="title" type="title" style={{ flex: 1 }}>
                { folderName }
            </Typography>
            <IconButton onClick={ () => this.setState({ isSearchShown: true }) }>
                <Search />
            </IconButton>
        </Toolbar>
    }
    renderBrowserTools(host, path) {
        const { browsers, sortCaps } = this.state,
            { location } = browsers.find(dev => dev.url.host === host) || { },
            saveKey = `browser-sort-${location}-${path}`,
            sortCriteria = localStorage.getItem(saveKey) || ''
        return <List disablePadding>
            <Select value={ sortCriteria }
                onChange={
                    field => {
                        const sortCriteria = updateSortCriteria(localStorage.getItem(saveKey) || '', field)
                        localStorage.setItem(saveKey, sortCriteria)
                        this.forceUpdate()
                    }
                }
                options={
                    sortCaps.map(value => ({
                        primary: SORT_DISPLAY_NAME[value] || value || 'None',
                        secondary: value,
                        value: value,
                    }))
                }
                render={
                    (selected, onClick) => <ListItem button onClick={ onClick }>
                        <ListItemIcon><Mail /></ListItemIcon>
                        <ListItemText primary={ `Sort: ${ sortCriteria || 'None'}` } />
                    </ListItem>
                }>
            </Select>
        </List>
    }
    renderDrawer() {
        const { isDrawerDocked, drawerWidth, sortCaps, albumartSwatches, browsers } = this.state,
            { playingLocation, playingPath, playingTrack, playingState } = this.state,
            backgroundImageUrl = cssStyleUrl(playingTrack.upnpAlbumArtURI || 'assets/thumbnail_default.png'),
            { url } = browsers.find(dev => dev.location === playingLocation) || { },
            playingPathName = `/browse/${url && url.host}/${playingPath}`
        return <Drawer
                className="drawer"
                type={ isDrawerDocked ? 'permanent' : 'temporary' }
                open={ this.state.isDrawerOpen }
                onRequestClose={ () => this.setState({ isDrawerOpen: false }) }>
            <div className="player">
                <div className="options">
                    {
                        this.props.location.pathname !== playingPathName && <IconButton
                            onClick={ () => this.props.history.push(playingPathName) }>
                            <PlaylistPlay />
                        </IconButton>
                    }
                    <IconButton><MoreVert /></IconButton>
                </div>
                <IconButton style={{ color: albumartSwatches.DarkMuted, width: '30%' }} className="control"
                    onClick={ () => this.playNext(-1) }>
                    <SkipPrevious style={{ width: 48, height: 48 }} />
                </IconButton>
                <IconButton style={{ color: albumartSwatches.DarkMuted, width: '30%', height: 72 }}
                    className="control"
                    onClick={ () => playingState.isPlaying ? this.pause() : this.play() }>
                    {
                        playingState.isPlaying ?
                            <PauseCircleOutline style={{ width: 72, height: 72 }} /> :
                            <PlayCircleOutline style={{ width: 72, height: 72 }} />
                    }
                </IconButton>
                <IconButton style={{ color: albumartSwatches.DarkMuted, width: '30%' }} className="control"
                    onClick={ () => this.playNext() }>
                    <SkipNext style={{ width: 48, height: 48 }}  />
                </IconButton>
            </div>
            <div className="player-bg" style={{ backgroundImage: `url(${backgroundImageUrl})` }}></div>
            <Divider />
            <List disablePadding style={{ width: drawerWidth }}>
                { this.renderBrowserSelector() }
                { this.renderOutputSelector() }
            </List>
            <Divider />
            <Route path="/browse/:host/(.*)"
                render={ props => this.renderBrowserTools(props.match.params.host, props.match.params[0]) } />
        </Drawer>
    }
    renderBrowser(host, path) {
        const { browsers, playingTrack, playingState, playingTime } = this.state,
            { location } = browsers.find(dev => dev.url.host === host) || { },
            saveKey = `browser-sort-${location}-${path}`,
            sortCriteria = localStorage.getItem(saveKey) || ''
        this.checkBrowseLocationChange(location)
        return <Browser
            onLoadStart={ () => this.setState({ isDrawerOpen: false, isSearchShown: false }) }
            onSelectFolder={ path => this.props.history.push(`/browse/${host}/${path}`) }
            onSelectTrack={ (track, queue) => this.playPauseTrack(track, location, path, queue) }
            { ...{ path, location, sortCriteria, playingState, playingTime, playingTrack } }>
        </Browser>
    }
    renderBody() {
        const { isDrawerOpen, isDrawerDocked, drawerWidth } = this.state
        return <div style={{ marginLeft: isDrawerDocked ? drawerWidth : 0 }} className="body">
            <Switch>
                <Route path="/browse/:host/(.*)"
                    render={ props => this.renderBrowser(props.match.params.host, props.match.params[0]) } />
                <Route path="/browse" render={
                    props => <List>
                        {
                            this.state.browsers.map(dev => <ListItem button key={ dev.location }
                                    onClick={ () => props.history.push(`/browse/${dev.url.host}/`) }>
                                <ListItemText primary={ dev.server } secondary={ dev.url.host } />
                            </ListItem>)
                        }
                    </List>
                }>
                </Route>
                <Route render={ () => <Redirect to="/browse" /> } />
            </Switch>
        </div>
    }

    checkRenderLocationChange = onChange(async (rendererLocation, lastRenderLocation) => {
        localStorage.setItem('main-renderer-location', rendererLocation)
        if (lastRenderLocation) {
            this.ws.emit('upnp-unsub', { url: lastRenderLocation })
        }
        if (rendererLocation) {
            this.ws.emit('upnp-sub', { url: rendererLocation }, update => this.setState(update))
        }
    })

    checkBrowseLocationChange = onChange(async browserLocation => {
        await new Promise(resolve => setTimeout(resolve, 10))

        const sortCaps = browserLocation ? await upnp.getSortCapabilities(browserLocation) : [ ]
        this.setState({ sortCaps })
    })

    checkAlbumartChange = onChange(async src => {
        if (!src) return
        await new Promise(resolve => setTimeout(resolve, 10))

        const img = document.createElement('img')
        img.crossOrigin = 'Anonymous'
        await new Promise((onload, onerror) => Object.assign(img, { src, onload, onerror }))
        const vibrant = new Vibrant(img),
            swatches = await vibrant.getPalette(),
            albumartSwatches = { }
        for (const key in swatches) {
            albumartSwatches[key] = swatches[key].getHex()
        }
        this.setState({ albumartSwatches })
    })

    render() {
        const { rendererLocation, playingTrack, playingTime, albumartSwatches } = this.state
        this.checkRenderLocationChange(rendererLocation)
        this.checkAlbumartChange(playingTrack.upnpAlbumArtURI)
        return <div>
            { this.renderAppBar() }
            { this.renderDrawer() }
            { this.renderBody() }
            <div className="progress" style={{ backgroundColor: albumartSwatches.Muted || '#eee' }}>
                <div className="bar" style={{
                    transform: `scaleX(${ playingTrack.res ? playingTime / hhmmss2sec(playingTrack.res.duration || '') : 0 })`,
                    backgroundColor: albumartSwatches.DarkMuted || '#aaa',
                }} />
            </div>
        </div>
    }
}

ReactDOM.render(<HashRouter><Route component={ Main } /></HashRouter>, document.getElementById('app'))