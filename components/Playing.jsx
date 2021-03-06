import React from 'react'
import { Link } from 'react-router-dom'

import IconButton from '@material-ui/core/IconButton'
import SkipNext from '@material-ui/icons/SkipNext'
import PlayCircleOutline from '@material-ui/icons/PlayCircleOutline'
import PauseCircleOutline from '@material-ui/icons/PauseCircleOutline'
import PlaylistPlay from '@material-ui/icons/PlaylistPlay'

import { cssStyleUrl, proxyURL, sec2mmss } from '../common/utils'

import './playing.less'
import Typography from '@material-ui/core/Typography'

export default class Playing extends React.Component {
    static cachedContext
    static getContext() {
        if (this.cachedContext) {
            return this.cachedContext
        }
        const audioContext = new AudioContext(),
            analyser = Object.assign(audioContext.createAnalyser(), { fftSize: 2048 }),
            specData = new Uint8Array(analyser.frequencyBinCount),
            specBuffer = new Uint8Array(analyser.frequencyBinCount)
        return this.cachedContext = { audioContext, analyser, specData, specBuffer }
    }
    mounted = false
    /** @type { HTMLCanvasElement} */
    canvasElem = null
    update() {
        const { analyser, specData, specBuffer } = Playing.getContext()
        analyser.getByteFrequencyData(specData)
        if (this.canvasElem && this.props.state.isPlaying) {
            const { width, height } = this.canvasElem,
                ctx = this.canvasElem.getContext('2d'),
                size = specData.length
            ctx.clearRect(0, 0, width, height)
            ctx.fillStyle = this.props.color || '#ccc'
            for (const [idx, val] of Array.from(specData).entries()) {
                const x = idx / size * 2 * width,
                    c = specBuffer[idx] = specBuffer[idx] * 0.95 + val * 0.05,
                    h = c / 256 * height
                ctx.fillRect(x, height / 2 - h / 2, width * 2 / size * 0.7, h)
            }
            ctx.fillStyle = this.props.dark || '#aaa'
            for (const [idx, val] of Array.from(specData).entries()) {
                const x = idx / size * 2 * width,
                    h = val / 256 * height * 0.8
                ctx.fillRect(x, height / 2 - h / 2, width * 2 / size * 0.7, h)
            }
        }
    }
    componentWillUnmount() {
        this.mounted = false
    }
    componentDidMount() {
        this.mounted = true
        const update = () => {
            if (this.mounted) {
                requestAnimationFrame(update)
                if (Playing.cachedContext) {
                    this.update()
                }
            }
        }
        requestAnimationFrame(update)
    }
    renderControl() {
        return <div className="control">
            <IconButton onClick={ () => this.props.onPlayPause() }>
            {
                this.props.state.isPlaying ?
                <PauseCircleOutline style={{ width: 32, height: 32 }} /> :
                <PlayCircleOutline style={{ width: 32, height: 32 }} />
            }
            </IconButton>
            <IconButton onClick={ () => this.props.onPlayNext() }>
                <SkipNext style={{ width: 32, height: 32 }} />
            </IconButton>
        </div>
    }
    render() {
        const { track, time, audio } = this.props,
            albumartSrc = track.upnpAlbumArtURI ? proxyURL(track.upnpAlbumArtURI) : 'assets/thumbnail_default.png'
        if (Playing.cachedContext && audio && !audio.connectedElementSource) {
            const { analyser, audioContext } = Playing.getContext(),
                source = audioContext.createMediaElementSource(audio)
            source.connect(analyser)
            source.connect(audioContext.destination)
            audio.connectedElementSource = source
        }
        const canvas = this.canvasElem
        if (canvas && (canvas.width !== canvas.scrollWidth || canvas.height !== canvas.scrollHeight)) {
            canvas.width = canvas.scrollWidth
            canvas.height = canvas.scrollHeight
        }
        return <div>
            <div className="playing-bg" style={{ backgroundImage: `url(${cssStyleUrl(albumartSrc)})` }}></div>
            <div className="playing-main">
                <div className="content">
                    <div className="title">
                        <div className="album-art-control">
                            { track.id && this.renderControl() }
                            <div className="nav">
                                <IconButton onClick={ () => this.props.history.push(this.props.playlistPath) }>
                                    <PlaylistPlay />
                                </IconButton>
                            </div>
                            <img className="album-art" src={ albumartSrc } />
                        </div>
                        <div className="info">
                            <Typography variant="h3" component="h1">
                                { track.dcTitle || 'Not Playing' }
                            </Typography>
                            <div style={{ marginTop: 32 }}>
                                <Typography variant="h5" component="h2">
                                    { track.upnpArtist || 'XX' } - { track.upnpAlbum || 'XXX' } [{ track.upnpOriginalTrackNumber || 1 }]
                                </Typography>
                                <p>{ sec2mmss(time) } / { track.resList && track.resList[0].duration || '-:--' }</p>
                            </div>
                        </div>
                    </div>
                    <canvas ref={ elem => this.canvasElem = elem } className="spectrum" />
                </div>
            </div>
        </div>
    }
}
