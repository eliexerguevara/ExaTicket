import React from "react";

import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import Select from "@material-ui/core/Select";
import { Checkbox, ListItemText, makeStyles } from "@material-ui/core";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
	select: {
		borderRadius: 10,
		backgroundColor: theme.palette.background.paper,
		"& .MuiOutlinedInput-notchedOutline": {
			borderColor: theme.palette.type === "dark" ? "#2a3942" : "rgba(0,0,0,0.12)",
		},
	},
}));

const TicketsQueueSelect = ({
	userQueues,
	selectedQueueIds = [],
	onChange,
	className,
	style,
}) => {
	const classes = useStyles();
	const handleChange = e => {
		onChange(e.target.value);
	};

	return (
		<FormControl variant="outlined" className={className} style={style}>
			<Select
				multiple
				displayEmpty
				variant="outlined"
				value={selectedQueueIds}
				onChange={handleChange}
				className={classes.select}
				MenuProps={{
					anchorOrigin: {
						vertical: "bottom",
						horizontal: "left",
					},
					transformOrigin: {
						vertical: "top",
						horizontal: "left",
					},
					getContentAnchorEl: null,
				}}
				renderValue={() => i18n.t("ticketsQueueSelect.placeholder")}
			>
				{userQueues?.length > 0 &&
					userQueues.map(queue => (
						<MenuItem dense key={queue.id} value={queue.id}>
							<Checkbox
								style={{
									color: queue.color,
								}}
								size="small"
								color="primary"
								checked={selectedQueueIds.indexOf(queue.id) > -1}
							/>
							<ListItemText primary={queue.name} />
						</MenuItem>
					))}
			</Select>
		</FormControl>
	);
};

export default TicketsQueueSelect;
