import * as React from 'react'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import Dialog from '@material-ui/core/Dialog'
import DialogTitle from '@material-ui/core/DialogTitle'

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
            <Dialog open={ open } onClose={ () => this.setState({ open: false }) }>
                <DialogTitle>{ title || 'Select An Item' }</DialogTitle>
                <List style={{ overflow: 'auto' }}>
                {
                    options.length ? options.map((option, index) => <ListItem
                        key={ option.value } button
                        onClick={ () => this.onSelectOption(option.value) }>
                        {
                            option.icon && <ListItemIcon>{ option.icon }</ListItemIcon>
                        }
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