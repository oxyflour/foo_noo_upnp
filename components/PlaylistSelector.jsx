import * as React from 'react'

import Dialog from '@material-ui/core/Dialog'
import DialogTitle from '@material-ui/core/DialogTitle'
import DialogContent from '@material-ui/core/DialogContent'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import DialogActions from '@material-ui/core/DialogActions'
import Button from '@material-ui/core/Button'

import { onChange } from '../common/utils'
import { upnpBrowse } from './Browser.jsx'

export default class PlaylistSelector extends React.Component {
    state = {
        sub: [],
    }
    update = onChange(async path => {
        const dirs = await upnpBrowse(this.props.location, path, 0, 99, ''),
            sub = dirs.filter(item => item.upnpClass.startsWith('object.container'))
        this.setState({ sub })
    })
    create() {
        const path = prompt('input the new playlist name', this.props.default)
        if (path) {
            this.props.onSelect(this.props.path + '/' + path)
        }
    }
    render() {
        const { sub } = this.state,
            { path } = this.props
        this.update(path)
        return <Dialog open={ true }>
            <DialogTitle>Select {path}</DialogTitle>
            <DialogContent>
                <List>
                {
                    sub.map(item => <ListItem button key={ item.id }>
                        <ListItemText onClick={ () => this.props.onChange(item.id) }
                            primary={ item.dcTitle }></ListItemText>
                    </ListItem>)
                }
                <ListItem button onClick={ () => this.create() }>
                    <ListItemText>[ Create New ]</ListItemText>
                </ListItem>
                </List>
            </DialogContent>
            <DialogActions>
                <Button color="primary" onClick={ () => this.props.onChange('') }>Cancel</Button>
                <Button color="primary" onClick={ () => this.props.onSelect(path) }>Choose Here</Button>
            </DialogActions>
        </Dialog>
    }
}
