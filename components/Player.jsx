import * as React from 'react'
import { Paper, IconButton } from 'material-ui'

import { PlayCircleFilled, PauseCircleFilled } from 'material-ui-icons'
import { hhmmss2sec, sec2mmss, cssStyleUrl, fetchJson } from '../common/utils'

import './Player.less'

export default class Player extends React.Component {
    tickTimeout = 0
    async onTick() {
        clearTimeout(this.tickTimeout)
        const currentTime = this.props.playingState.isPlaying ? await this.props.getPosition() : this.state.currentTime,
            rest = Math.floor(currentTime) + 1 - currentTime,
            timeout = rest < 0.1 ? rest + 1 : rest
        this.tickTimeout = setTimeout(this.onTick, timeout * 1000)
        this.setState({ currentTime })
    }

    state = {
        currentTime: 0,
    }
    async componentDidMount() {
        this.onTick = this.onTick.bind(this)
        this.onTick()
    }
    render() {
        const { playingTrack, playingState } = this.props,
            { currentTime } = this.state,
            backgroundImageUrl = cssStyleUrl(playingTrack.upnpAlbumArtURI || 'assets/thumbnail_default.png')
        return <div className="player">
            <Paper className="control" elevation={ 16 }>
                <div className="albumart" style={{ backgroundImage: `url(${backgroundImageUrl})` }}></div>
                <div className="status">
                    <div className="content">
                        <a href="javascript:void(0)" onClick={ () => this.props.onBrowsePlaying() }>
                            { playingTrack.dcTitle } [{ sec2mmss(currentTime) } / { playingTrack.res ? playingTrack.res.duration : '--:--' }]
                        </a>
                        <span>
                        {
                            playingState.isPlaying ?
                                <IconButton onClick={ evt => this.props.onPause() }><PauseCircleFilled /></IconButton> :
                                <IconButton onClick={ evt => this.props.onPlay() }><PlayCircleFilled /></IconButton>
                        }
                        </span>
                    </div>
                </div>
            </Paper>
            <div className="progress">
                <div className="bar" style={{
                    width: `${playingTrack.res ? currentTime * 100 / hhmmss2sec(playingTrack.res.duration || '') : 0}%`
                }}></div>
            </div>
        </div>
    }
}