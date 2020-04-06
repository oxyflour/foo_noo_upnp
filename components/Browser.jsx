import * as React from 'react'
import * as url from 'url'

import List, {
    ListItem, ListItemAvatar, ListItemIcon,
    ListItemText, ListItemSecondaryAction
} from 'material-ui/List'
import ListSubheader from 'material-ui/List/ListSubheader'
import Card, { CardMedia, CardContent, CardActions } from 'material-ui/Card'
import { GridList, GridListTile, GridListTileBar } from 'material-ui/GridList'
import IconButton from 'material-ui/IconButton'
import Avatar from 'material-ui/Avatar'
import Typography from 'material-ui/Typography'
import Button from 'material-ui/Button'
import Grid from 'material-ui/Grid'
import { CircularProgress } from 'material-ui/Progress'
import Menu, { MenuItem } from 'material-ui/Menu'

import Info from 'material-ui-icons/Info'
import PlayArrow from 'material-ui-icons/PlayArrow'
import Pause from 'material-ui-icons/Pause'
import MoreVert from 'material-ui-icons/MoreVert'
import Check from 'material-ui-icons/Check'
import Close from 'material-ui-icons/Close'
import CheckBoxOutlineBlank from 'material-ui-icons/CheckBoxOutlineBlank'

import { debounce, hhmmss2sec, sec2mmss, cssStyleUrl, fetchJson, onChange } from '../common/utils'

import './Browser.less'

function albumartURL(src) {
    return cssStyleUrl(src ? 'upnp-proxy/' + src.replace(/^\w+:\/\//, '') : 'assets/thumbnail_default.png') 
}

export async function upnpBrowse(url,
        ObjectID = '0', StartingIndex = 0, RequestedCount = 10,
        SortCriteria = '', SearchCriteria) {
    const Filter = '', BrowseFlag = 'BrowseDirectChildren', ContainerID = ObjectID,
        inputs = { ObjectID, ContainerID, StartingIndex, RequestedCount, SortCriteria, SearchCriteria, Filter, BrowseFlag },
        method = SearchCriteria !== undefined ? 'Search' : 'Browse'
    return await fetchJson(`upnp-content-directory/${method}`, { url, inputs })
}

export function getTitleMain(title) {
    return title.replace(/\[[^\]]+\]/g, '')
        .replace(/\([^\)]+\)/g, '')
}

export function getTitleSub(title) {
    const brackets = [ ]
    title.replace(/\[[^\]]+\]/g, m => brackets.push(m))
        .replace(/\([^\)]+\)/g, m => brackets.push(m))
    return brackets.join(' ')
}

const browserCache = { },
    browserScrollTop = { }
export default class Browser extends React.Component {
    async reload() {
        const key = this.getCacheKey()
        delete browserCache[key]
        await this.beginLoad()
    }
    async beginLoad() {
        await new Promise(resolve => setTimeout(resolve, 10))
        const { location, path } = this.props,
            key = this.getCacheKey(),
            cache = browserCache[key]
        this.setState({ hasMore: true, list: cache || [ ] })
        await this.loadMore()
        document.body.scrollTop = browserScrollTop[key]
        this.props.onLoadStart && this.props.onLoadStart(location, path)
    }
    async loadMore(count = 20) {
        const { location, path, sortCriteria } = this.props,
            begin = this.state.list.length,
            list = this.state.list.slice(),
            [browsePath, searchKeyword] = path.split(path[0] === '~' ? '~/' : '/~/'),
            cacheKey = this.getCacheKey(),
            more = location ?
                await upnpBrowse(location, browsePath || '0', begin, count,
                    sortCriteria || '+upnp:Album,+upnp:originalTrackNumber',
                    searchKeyword) :
                [ ],
            hasMore = more.length === count
        more.forEach((item, index) => list[begin + index] = item)
        browserCache[cacheKey] = list
        if (this.getCacheKey() === cacheKey) {
            this.setState({ list, hasMore })
            this.checkMore()
        }
        return list
    }
    searchFolder() {
        const { containerMenuItem } = this.state
        this.props.onSelectFolder(containerMenuItem.id + '/~/')
        this.setState({ containerMenuItem: null })
    }
    async selectTrack(item) {
        this.props.onSelectTrack(item)
        this.props.onSyncQueue(await this.loadMore(99))
    }

    loadingElement = null
    checkMore() {
        if (this.state.hasMore && this.loadingElement) {
            const rect = this.loadingElement.getBoundingClientRect()
            if (rect.top < window.innerHeight) {
                this.loadMore()
            }
        }
    }

    beginSelectTrack(item) {
        const { selected } = this.state
        if (selected[item.id]) {
            delete selected[item.id]
        } else {
            selected[item.id] = item
        }
        this.props.onBeginSelectTracks(Object.values(selected))
    }
    async selectAll() {
        const list = await this.loadMore(99)
        const { selected } = this.state
        for (const item of list) {
            selected[item.id] = item
        }
        this.props.onBeginSelectTracks(Object.values(selected))
    }

    state = {
        hasMore: true,
        list: [ ],
        selected: { },
        containerMenuItem: null,
        containerMenuElem: null,
    }
    componentWillUnmount() {
        window.removeEventListener('scroll', this.checkMore)
    }
    componentDidMount() {
        window.addEventListener('scroll', this.checkMore = debounce(this.checkMore.bind(this), 500))
    }
    currentLocation = null
    renderContainers() {
        const { onSelectFolder } = this.props,
            { list } = this.state,
            containers = list.filter(item => item.upnpClass.startsWith('object.container'))
        return containers.length > 0 && <Grid container justify="center">
        {
            containers.map(item => <Card className="card" key={ item.id }>
                <CardMedia className="albumart"
                    image={ albumartURL(item.upnpAlbumArtURI) }
                    title="albumart">
                </CardMedia>
                <CardContent className="content">
                    <Typography onClick={ () => onSelectFolder(item.id) }
                        className="title" title={ item.dcTitle } type="title">
                        { getTitleMain(item.dcTitle) || 'Untitled' }
                    </Typography>
                    <Typography className="sub">
                        <IconButton className="more"
                            onClick={
                                evt => this.setState({
                                    containerMenuItem: item,
                                    containerMenuElem: evt.currentTarget
                                })
                            }>
                            <MoreVert style={{ width: 18, height: 18 }} />
                        </IconButton>
                        { getTitleSub(item.dcTitle) || 'folder' }
                    </Typography>
                </CardContent>
            </Card>)
        }
        </Grid>
    }
    renderTracks() {
        const { playingTrack, playingState, onSelectFolder, playingTime, albumartSwatches, isSelectingTracks } = this.props,
            { list, selected } = this.state,
            tracks = list.filter(item => item.upnpClass === 'object.item.audioItem.musicTrack'),
            albums = { }
        for (const track of tracks) {
            const groupBy = track.parentID + '/' + track.upnpAlbum,
                album = albums[groupBy] || (albums[groupBy] = Object.assign({ groupBy, tracks: [] }, track))
            album.tracks.push(track)
        }
        return <List className="album-list">
        {
            Object.values(albums).map(album => <div className="album" key={ album.groupBy }>
            <ListSubheader className="album-header" disableSticky={ true }>
                <span className="albumart" style={{
                    backgroundImage: `url(${albumartURL(album.upnpAlbumArtURI)})`
                }}></span>
                <span className="title">
                    <a href="javascript:void(0)"
                        onClick={ () => onSelectFolder(album.parentID) }
                        className="primary">{ album.upnpAlbum }</a>
                    <br />
                    <span className="sub">{ album.upnpArtistAlbumArtist }</span>
                </span>
            </ListSubheader>
            {
                album.tracks.map(item => <ListItem key={ item.id }
                    button
                    className={ [
                        'track',
                        item.id === playingTrack.id && 'playing',
                        isSelectingTracks && selected[item.id] && 'selected'
                    ].join(' ') }>
                    <ListItemAvatar onClick={ () => this.beginSelectTrack(item) }>
                        <Avatar style={{ backgroundColor: item.id === playingTrack.id ? albumartSwatches.DarkMuted : undefined }}>
                        {
                            isSelectingTracks ? (selected[item.id] ? <Check /> : ' ') :
                            item.id === playingTrack.id && playingState.isPlaying ? <PlayArrow /> : 
                            item.id === playingTrack.id && playingState.isPaused ? <Pause />:
                                (item.upnpOriginalTrackNumber % 100 || '?')
                        }
                        </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                        onClick={ () => this.selectTrack(item) }
                        primary={ item.dcTitle }
                        secondary={
                            <span className="artist">{ item.upnpArtist }</span>
                        }>
                    </ListItemText>
                    <ListItemSecondaryAction className="action">
                        { item.id === playingTrack.id && sec2mmss(playingTime) + ' / ' }
                        { item.resList && sec2mmss(hhmmss2sec(item.resList[0].duration || '')) }
                        {
                            item.id === playingTrack.id && playingState.isPlaying &&
                                <img className="playing-ani" src="assets/ani_equalizer_black.gif" />
                        }
                    </ListItemSecondaryAction>
                </ListItem>)
            }
            </div>)
        }
        </List>
    }
    getCacheKey() {
        const { location, path, sortCriteria } = this.props
        return [location, path, sortCriteria].join('#')
    }
    checkLocationChange = onChange((cacheKey, lastCacheKey) => {
        browserScrollTop[lastCacheKey] = document.body.scrollTop
        this.beginLoad()
    })
    checkIsSelectingTracks = onChange(isSelectingTracks => {
        if (!isSelectingTracks) {
            this.setState({ selected: { } })
        }
    })
    render() {
        this.checkLocationChange(this.getCacheKey())
        this.checkIsSelectingTracks(this.props.isSelectingTracks)
        
        const { hasMore, containerMenuItem, containerMenuElem } = this.state
        return <div className="browser">
            { this.renderContainers() }
            { this.renderTracks() }
            {
                hasMore && <Grid className="loading" container justify="center">
                    <span ref={ elem => this.loadingElement = elem }>
                        <CircularProgress />
                    </span>
                </Grid>
            }
            <Menu
                open={ !!containerMenuItem }
                anchorEl={ containerMenuElem }
                onClose={ () => this.setState({ containerMenuItem: null }) }>
                <MenuItem onClick={ () => this.searchFolder() }>
                    Display All
                </MenuItem>
                <MenuItem onClick={ () => this.addToPlaylist() }>
                    Add All to Playlist
                </MenuItem>
                <MenuItem onClick={ () => this.createPlaylist() }>
                    Create Playlist
                </MenuItem>
            </Menu>
        </div>
    }
}