import React from 'react'
import { Link } from 'react-router-dom'

import IconButton from '@material-ui/core/IconButton'
import SkipPrevious from '@material-ui/icons/SkipPrevious'
import SkipNext from '@material-ui/icons/SkipNext'
import PlayCircleOutline from '@material-ui/icons/PlayCircleOutline'
import PauseCircleOutline from '@material-ui/icons/PauseCircleOutline'

import { cssStyleUrl, proxyURL, sec2mmss } from '../common/utils'

import './playing.less'

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
    /** @type { HTMLAudioElement } */
    lastAudio = null
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
                    c = specBuffer[idx] = specBuffer[idx] * 0.9 + val * 0.1,
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
        if (this.lastAudio) {
            const { analyser, audioContext } = Playing.getContext(),
                source = /** @type { any } */(this.lastAudio).connectedElementSource
            source.disconnect(analyser)
            // source.disconnect(audioContext.destination)
            this.lastAudio = null
        }
    }
    componentDidMount() {
        this.mounted = true
        const update = () => {
            if (this.mounted) {
                requestAnimationFrame(update)
                this.update()
            }
        }
        requestAnimationFrame(update)
    }
    render() {
        const { track, state, time, audio } = this.props,
            albumartSrc = track.upnpAlbumArtURI ? proxyURL(track.upnpAlbumArtURI) : 'assets/thumbnail_default.png',
            { analyser, audioContext } = Playing.getContext()
        if (audio !== this.lastAudio) {
            if (this.lastAudio) {
                const { source, analyser, destination } = /** @type { any } */(this.lastAudio).connectedElementSource
                source.disconnect(analyser)
                source.disconnect(destination)
            }
            if (audio && !audio.connectedElementSource) {
                const source = audioContext.createMediaElementSource(audio)
                source.connect(analyser)
                source.connect(audioContext.destination)
                audio.connectedElementSource = source
            } else if (audio && audio.connectedElementSource) {
                const source = audio.connectedElementSource
                source.connect(analyser)
            }
            this.lastAudio = audio
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
                        <img className="album-art" src={ albumartSrc } />
                        <div className="info">
                            <h2>{ track.dcTitle || 'Not Playing' }</h2>
                            {
                                track.id ?
                                <div>
                                    <p>{ track.upnpAlbum } [{ track.upnpOriginalTrackNumber }] - { track.upnpArtist }</p>
                                    <p>{ sec2mmss(time) } / { track.resList[0].duration || '' }</p>
                                </div> :
                                <h3>
                                    {
                                        this.props.playlistPath &&
                                        <span style={{ marginRight: 32 }}>
                                            <Link to={ this.props.playlistPath }>playlist</Link>
                                        </span>
                                    }
                                    <Link to="/browse">browse</Link>
                                </h3>
                            }
                            {
                                track.id &&
                                <div className="control">
                                    <IconButton>
                                        <SkipPrevious style={{ width: 48, height: 48 }} />
                                    </IconButton>
                                    <IconButton>
                                        {
                                            state.isPlaying ?
                                            <PauseCircleOutline style={{ width: 72, height: 72 }} /> :
                                            <PlayCircleOutline style={{ width: 72, height: 72 }} />
                                        }
                                    </IconButton>
                                    <IconButton>
                                        <SkipNext style={{ width: 48, height: 48 }} />
                                    </IconButton>
                                </div>
                            }
                        </div>
                    </div>
                    <canvas ref={ elem => this.canvasElem = elem } className="spectrum">
                    </canvas>
                </div>
            </div>
        </div>
    }
}
