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

import { debounce, hhmmss2sec, sec2mmss, cssStyleUrl, fetchJson } from '../common/utils'

import './Browser.less'

async function getSearchCapabilities(url) {
    const inputs = { }
    try {
        const result = await fetchJson('/upnp/GetSearchCapabilities', { url, inputs })
        return (result.SearchCaps || '').split(',')
    } catch (err) {
        console.error(`GetSortCriteria seems not implemented by ${url}`, err)
        return [ ]
    }
}

async function upnpBrowse(url,
        ObjectID = '0', StartingIndex = 0, RequestedCount = 10,
        SortCriteria = '', SearchCriteria) {
    const Filter = '', BrowseFlag = 'BrowseDirectChildren', ContainerID = ObjectID,
        inputs = { ObjectID, ContainerID, StartingIndex, RequestedCount, SortCriteria, SearchCriteria, Filter, BrowseFlag },
        method = SearchCriteria !== undefined ? 'Search' : 'Browse'
    return await fetchJson(`upnp-content-directory/${method}`, { url, inputs })
}

function getTitleMain(title) {
    return title.replace(/\[[^\]]+\]/g, '')
        .replace(/\([^\)]+\)/g, '') || 'Unamed'
}

function getTitleSub(title) {
    const brackets = [ ]
    title.replace(/\[[^\]]+\]/g, m => brackets.push(m))
        .replace(/\([^\)]+\)/g, m => brackets.push(m))
    return brackets.join(' ') || 'folder'
}

const browserCache = { },
    browserScrollTop = { }
export default class Browser extends React.Component {
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
    async loadMore() {
        const { location, path, sortCriteria } = this.props,
            begin = this.state.list.length,
            list = this.state.list.slice(),
            count = 20,
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
    }
    searchFolder() {
        const { containerMenuItem } = this.state
        this.props.onSelectFolder(containerMenuItem.id + '/~/')
        this.setState({ containerMenuItem: null })
    }
    async selectTrack(item) {
        const { location, path, sortCriteria } = this.props,
            [browsePath, searchKeyword] = path.split('/~/'),
            queue = await upnpBrowse(location, browsePath || '0', 0, 99,
                sortCriteria || '+upnp:Album,+upnp:originalTrackNumber',
                searchKeyword)
        this.props.onSelectTrack(item, queue)
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

    state = {
        hasMore: true,
        list: [ ],
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
        return containers.length > 0 && <Grid container align="stretch" justify="center">
        {
            containers.map(item => <Card className="card" key={ item.id }>
                <CardMedia className="albumart"
                    image={ cssStyleUrl(item.upnpAlbumArtURI || 'assets/thumbnail_default.png') }
                    title="albumart">
                </CardMedia>
                <CardContent className="content">
                    <Typography onClick={ () => onSelectFolder(item.id) }
                        className="title" title={ item.dcTitle } type="title">
                        { getTitleMain(item.dcTitle) }
                    </Typography>
                    <Typography className="sub">
                        { getTitleSub(item.dcTitle) }
                        <IconButton className="more"
                            onClick={
                                evt => this.setState({
                                    containerMenuItem: item,
                                    containerMenuElem: evt.currentTarget
                                })
                            }>
                            <MoreVert style={{ width: 18, height: 18 }} />
                        </IconButton>
                    </Typography>
                </CardContent>
            </Card>)
        }
        </Grid>
    }
    renderTracks() {
        const { playingTrack, playingState, onSelectFolder } = this.props,
            { list } = this.state,
            tracks = list.filter(item => item.upnpClass === 'object.item.audioItem.musicTrack')
                .map(track => Object.assign(track, { groupBy: track.parentID + '/' + track.upnpAlbum })),
            albums = Array.from(new Set(tracks.map(item => item.groupBy)))
                .map(group => tracks.find(track => track.groupBy === group))
        return <List subheader className="album-list">
        {
            albums.map(album => <div className="album" key={ album.groupBy }>
            <ListSubheader className="album-header">
                <span className="albumart" style={{
                    backgroundImage: `url(${cssStyleUrl(album.upnpAlbumArtURI || 'assets/thumbnail_default.png')})`
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
                tracks.filter(track => track.groupBy === album.groupBy).map(item => <ListItem key={ item.id }
                    button
                    className={ ['track', item.id === playingTrack.id && 'playing'].join(' ') }
                    onClick={ () => this.selectTrack(item) }>
                    <ListItemAvatar>
                        <Avatar>
                        {
                            item.id === playingTrack.id && playingState.isPlaying ? <PlayArrow /> : 
                            item.id === playingTrack.id && playingState.isPaused ? <Pause />:
                                (item.upnpOriginalTrackNumber % 100 || '?')
                        }
                        </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                        primary={ item.dcTitle }
                        secondary={
                            <span className="artist">{ item.upnpArtist }</span>
                        }>
                    </ListItemText>
                    <ListItemSecondaryAction>
                        {
                            item.id === playingTrack.id && playingState.isPlaying &&
                                <img className="playing-ani" src="assets/ani_equalizer_black.gif" />
                        }
                        { sec2mmss(hhmmss2sec(item.res.duration || '')) }
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
    checkLocationChange() {
        const cacheKey = this.getCacheKey()
        if (this.currentLocation !== cacheKey) {
            browserScrollTop[this.currentLocation] = document.body.scrollTop
            this.currentLocation = cacheKey
            this.beginLoad()
        }
    }
    render() {
        this.checkLocationChange()
        
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
                onRequestClose={ () => this.setState({ containerMenuItem: null }) }>
                <MenuItem onClick={ () => this.searchFolder() }>
                    Display All
                </MenuItem>
                <MenuItem>
                    Add All to Playlist
                </MenuItem>
            </Menu>
        </div>
    }
}