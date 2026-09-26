import React from "react";

import { Avatar, CardHeader, makeStyles } from "@material-ui/core";

import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
	root: {
		cursor: "pointer",
		flex: 1,
		minWidth: 0,
		padding: "8px 4px",
	},
	title: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		fontWeight: 600,
	},
	channelChip: {
		display: "inline-flex",
		alignItems: "center",
		padding: "1px 6px",
		borderRadius: 4,
		fontSize: "0.62em",
		fontWeight: 700,
		color: "#fff",
		letterSpacing: "0.02em",
		flexShrink: 0,
	},
	waChip: {
		background: "#25D366",
	},
	tgChip: {
		background: "#2CA5E0",
	},
	subheader: {
		color: theme.palette.text.secondary,
	},
}));

const TicketInfo = ({ contact, ticket, onClick }) => {
	const classes = useStyles();

	return (
		<CardHeader
			onClick={onClick}
			className={classes.root}
			titleTypographyProps={{ noWrap: true, component: "div" }}
			subheaderTypographyProps={{ noWrap: true, variant: "body2" }}
			avatar={
				<Avatar
					src={contact.profilePicUrl}
					alt="contact_image"
					style={{ width: 44, height: 44 }}
				/>
			}
			title={
				<span className={classes.title}>
					<span>{contact.name} #{ticket.id}</span>
					{ticket.whatsappId && (
						<span className={`${classes.channelChip} ${classes.waChip}`}>WA</span>
					)}
					{ticket.telegramId && (
						<span className={`${classes.channelChip} ${classes.tgChip}`}>TG</span>
					)}
				</span>
			}
			subheader={
				ticket.user && (
					<span className={classes.subheader}>
						{i18n.t("messagesList.header.assignedTo")} {ticket.user.name}
					</span>
				)
			}
		/>
	);
};

export default TicketInfo;
