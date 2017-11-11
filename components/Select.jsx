import * as React from 'react'
import List, { ListItem, ListItemIcon, ListItemText } from 'material-ui/List'
import Dialog, { DialogTitle } from 'material-ui/Dialog'
import Button from 'material-ui/Button'

export default class Select extends React.Component {
    state = {
        open: false
    }
    onSelectOption(value) {
        this.props.onChange(value)
        this.setState({ open: false })
    }
    render() {
        const { open } = this.state,
            { value, options, title, render } = this.props,
            selected = options.find(option => option.value === value)
        return <div>
            { render(selected, () => this.setState({ open: true })) }
            <Dialog open={ open } onRequestClose={ () => this.setState({ open: false }) }>
                <DialogTitle>{ title || 'Select An Item' }</DialogTitle>
                <List style={{ overflow: 'auto' }}>
                {
                    options.length ? options.map((option, index) => <ListItem
                        key={ option.value } button
                        onClick={ () => this.onSelectOption(option.value) }>
                        <ListItemText primary={
                            value === option.value ? <b>[active] { option.primary }</b> : option.primary
                        } secondary={ option.secondary }></ListItemText>
                    </ListItem>) : <ListItem>
                        <ListItemText primary="No selection"></ListItemText>
                    </ListItem>
                }
                </List>
            </Dialog>
        </div>
    }
}