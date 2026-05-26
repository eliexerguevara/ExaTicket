import React, { useState, useEffect, useRef, useContext } from "react";

import { useHistory, useParams } from "react-router-dom";
import { parseISO, format, isSameDay } from "date-fns";
import clsx from "clsx";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import Typography from "@material-ui/core/Typography";
import Avatar from "@material-ui/core/Avatar";
import Divider from "@material-ui/core/Divider";
import Badge from "@material-ui/core/Badge";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import IconButton from "@material-ui/core/IconButton";
import CircularProgress from "@material-ui/core/CircularProgress";
import Button from "@material-ui/core/Button";
import SearchIcon from "@material-ui/icons/Search";
import CloseIcon from "@material-ui/icons/Close";
import CheckCircleOutlineIcon from "@material-ui/icons/CheckCircleOutline";

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import ButtonWithSpinner from "../ButtonWithSpinner";
import MarkdownWrapper from "../MarkdownWrapper";
import { Tooltip } from "@material-ui/core";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";
import { Android } from "@material-ui/icons";

const useStyles = makeStyles(theme => ({
	ticket: {
		position: "relative",
	},

	pendingTicket: {
		cursor: "unset",
	},

	noTicketsDiv: {
		display: "flex",
		height: "100px",
		margin: 40,
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
	},

	noTicketsText: {
		textAlign: "center",
		color: "rgb(104, 121, 146)",
		fontSize: "14px",
		lineHeight: "1.4",
	},

	noTicketsTitle: {
		textAlign: "center",
		fontSize: "16px",
		fontWeight: "600",
		margin: "0px",
	},

	contactNameWrapper: {
		display: "flex",
		justifyContent: "space-between",
	},

	lastMessageTime: {
		justifySelf: "flex-end",
	},

	closedBadge: {
		alignSelf: "center",
		justifySelf: "flex-end",
		marginRight: 32,
		marginLeft: "auto",
	},

	contactLastMessage: {
		paddingRight: 20,
	},

	newMessagesCount: {
		alignSelf: "center",
		marginRight: 8,
		marginLeft: "auto",
	},

	badgeStyle: {
		color: "white",
		backgroundColor: green[500],
	},

	pendingButtons: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		paddingTop: 2,
	},

	previewBtn: {
		padding: 4,
		color: theme.palette.primary.main,
		border: `1px solid ${theme.palette.primary.main}`,
		borderRadius: 4,
		"&:hover": {
			backgroundColor: theme.palette.primary.main + "14",
		},
	},

	ticketQueueColor: {
		flex: "none",
		width: "8px",
		height: "100%",
		position: "absolute",
		top: "0%",
		left: "0%",
	},

	userTag: {
		position: "absolute",
		marginRight: 5,
		right: 5,
		bottom: 5,
		background: "#2576D2",
		color: "#ffffff",
		border: "1px solid #CCC",
		padding: 1,
		paddingLeft: 5,
		paddingRight: 5,
		borderRadius: 10,
		fontSize: "0.9em"
	},

	aiTag: {
		position: "absolute",
		marginRight: 5,
		right: 5,
		top: 5,
		background: "#7c3aed",
		color: "#ffffff",
		border: "1px solid #6d28d9",
		padding: 1,
		paddingLeft: 5,
		paddingRight: 5,
		borderRadius: 10,
		fontSize: "0.75em",
		display: "flex",
		alignItems: "center",
		gap: 2,
	},

	// ── Preview dialog ─────────────────────────────────────────
	previewDialogTitle: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: 4,
	},

	previewContactInfo: {
		display: "flex",
		alignItems: "center",
		gap: 10,
	},

	previewQueue: {
		fontSize: "0.75em",
		color: theme.palette.text.secondary,
		marginTop: 2,
	},

	previewMessagesBox: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
		minHeight: 120,
		maxHeight: 340,
		overflowY: "auto",
		padding: "8px 4px",
	},

	previewBubble: {
		maxWidth: "78%",
		padding: "6px 10px",
		borderRadius: 8,
		fontSize: "0.85em",
		lineHeight: 1.4,
		wordBreak: "break-word",
	},

	previewBubbleFromMe: {
		alignSelf: "flex-end",
		backgroundColor: "#dcf8c6",
		color: "#222",
	},

	previewBubbleFromUser: {
		alignSelf: "flex-start",
		backgroundColor: theme.palette.type === "dark" ? "#374151" : "#f0f0f0",
		color: theme.palette.text.primary,
	},

	previewBubbleTime: {
		fontSize: "0.7em",
		color: "#888",
		marginTop: 2,
		textAlign: "right",
	},

	previewLoading: {
		display: "flex",
		justifyContent: "center",
		alignItems: "center",
		height: 120,
	},

	previewEmpty: {
		textAlign: "center",
		color: theme.palette.text.secondary,
		padding: "20px 0",
		fontSize: "0.85em",
	},
}));

const TicketListItem = ({ ticket }) => {
	const classes = useStyles();
	const history = useHistory();
	const [loading, setLoading] = useState(false);
	const { ticketId } = useParams();
	const isMounted = useRef(true);
	const { user } = useContext(AuthContext);

	// Preview dialog state
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewMessages, setPreviewMessages] = useState([]);
	const [previewLoading, setPreviewLoading] = useState(false);

	useEffect(() => {
		return () => {
			isMounted.current = false;
		};
	}, []);

	const handleAcepptTicket = async id => {
		setLoading(true);
		try {
			await api.put(`/tickets/${id}`, {
				status: "open",
				userId: user?.id,
			});
		} catch (err) {
			setLoading(false);
			toastError(err);
		}
		if (isMounted.current) {
			setLoading(false);
		}
		history.push(`/tickets/${id}`);
	};

	const handleSelectTicket = id => {
		history.push(`/tickets/${id}`);
	};

	const handleOpenPreview = async e => {
		e.stopPropagation();
		setPreviewOpen(true);
		setPreviewLoading(true);
		try {
			const { data } = await api.get(`/messages/${ticket.id}`, {
				params: { pageNumber: 1 },
			});
			if (isMounted.current) {
				setPreviewMessages(data.messages || []);
			}
		} catch (err) {
			toastError(err);
		} finally {
			if (isMounted.current) setPreviewLoading(false);
		}
	};

	const handleClosePreview = e => {
		if (e) e.stopPropagation();
		setPreviewOpen(false);
	};

	const handleAcceptFromPreview = async e => {
		e.stopPropagation();
		setPreviewOpen(false);
		await handleAcepptTicket(ticket.id);
	};

	return (
		<React.Fragment key={ticket.id}>
			<ListItem
				dense
				button
				onClick={e => {
					if (ticket.status === "pending") return;
					handleSelectTicket(ticket.id);
				}}
				selected={ticketId && +ticketId === ticket.id}
				className={clsx(classes.ticket, {
					[classes.pendingTicket]: ticket.status === "pending",
				})}
			>
				<Tooltip
					arrow
					placement="right"
					title={ticket.queue?.name || "Sem fila"}
				>
					<span
						style={{ backgroundColor: ticket.queue?.color || "#7C7C7C" }}
						className={classes.ticketQueueColor}
					></span>
				</Tooltip>
				<ListItemAvatar>
					<Avatar src={ticket?.contact?.profilePicUrl} />
				</ListItemAvatar>
				<ListItemText
					disableTypography
					primary={
						<span className={classes.contactNameWrapper}>
							<Typography
								noWrap
								component="span"
								variant="body2"
								color="textPrimary"
							>
								{ticket.contact.name}
							</Typography>
							{ticket.status === "closed" && (
								<Badge
									className={classes.closedBadge}
									badgeContent={"closed"}
									color="primary"
								/>
							)}
							{ticket.lastMessage && (
								<Typography
									className={classes.lastMessageTime}
									component="span"
									variant="body2"
									color="textSecondary"
								>
									{isSameDay(parseISO(ticket.updatedAt), new Date()) ? (
										<>{format(parseISO(ticket.updatedAt), "HH:mm")}</>
									) : (
										<>{format(parseISO(ticket.updatedAt), "dd/MM/yyyy")}</>
									)}
								</Typography>
							)}
							{ticket.aiActive && !ticket.isGroup && (
								<Tooltip title={i18n.t("aiChat.aiHandling")}>
									<div className={classes.aiTag}>
										<Android style={{ fontSize: 11 }} />
										IA
									</div>
								</Tooltip>
							)}
							{ticket.whatsappId && (
								<div className={classes.userTag} title={i18n.t("ticketsList.connectionTitle")}>{ticket.whatsapp?.name}</div>
							)}
						</span>
					}
					secondary={
						<span className={classes.contactNameWrapper}>
							{ticket.status === "pending" ? (
								<span className={classes.pendingButtons}>
									<Tooltip title="Ver conversación">
										<IconButton
											size="small"
											className={classes.previewBtn}
											onClick={handleOpenPreview}
										>
											<SearchIcon fontSize="small" />
										</IconButton>
									</Tooltip>
									<ButtonWithSpinner
										color="primary"
										variant="contained"
										size="small"
										loading={loading}
										onClick={e => {
											e.stopPropagation();
											handleAcepptTicket(ticket.id);
										}}
									>
										{i18n.t("ticketsList.buttons.accept")}
									</ButtonWithSpinner>
								</span>
							) : (
								<>
									<Typography
										className={classes.contactLastMessage}
										noWrap
										component="span"
										variant="body2"
										color="textSecondary"
									>
										{ticket.lastMessage ? (
											<MarkdownWrapper>{ticket.lastMessage}</MarkdownWrapper>
										) : (
											<br />
										)}
									</Typography>

									<Badge
										className={classes.newMessagesCount}
										badgeContent={ticket.unreadMessages}
										classes={{
											badge: classes.badgeStyle,
										}}
									/>
								</>
							)}
						</span>
					}
				/>
			</ListItem>

			{/* ── Preview Dialog ── */}
			<Dialog
				open={previewOpen}
				onClose={handleClosePreview}
				maxWidth="sm"
				fullWidth
				onClick={e => e.stopPropagation()}
			>
				<DialogTitle disableTypography className={classes.previewDialogTitle}>
					<div className={classes.previewContactInfo}>
						<Avatar
							src={ticket?.contact?.profilePicUrl}
							style={{ width: 36, height: 36 }}
						/>
						<div>
							<Typography variant="subtitle1" style={{ fontWeight: 600, lineHeight: 1.2 }}>
								{ticket.contact.name}
							</Typography>
							{ticket.queue && (
								<Typography className={classes.previewQueue}>
									{ticket.queue.name}
								</Typography>
							)}
						</div>
					</div>
					<IconButton size="small" onClick={handleClosePreview}>
						<CloseIcon fontSize="small" />
					</IconButton>
				</DialogTitle>

				<DialogContent dividers style={{ padding: "8px 12px" }}>
					{previewLoading ? (
						<div className={classes.previewLoading}>
							<CircularProgress size={28} />
						</div>
					) : previewMessages.length === 0 ? (
						<Typography className={classes.previewEmpty}>
							Sin mensajes aún.
						</Typography>
					) : (
						<div className={classes.previewMessagesBox}>
							{previewMessages.map(msg => (
								<div key={msg.id}>
									<div
										className={clsx(classes.previewBubble, {
											[classes.previewBubbleFromMe]: msg.fromMe,
											[classes.previewBubbleFromUser]: !msg.fromMe,
										})}
									>
										<MarkdownWrapper>{msg.body}</MarkdownWrapper>
										<div className={classes.previewBubbleTime}>
											{format(parseISO(msg.createdAt), "HH:mm")}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</DialogContent>

				<DialogActions style={{ padding: "8px 16px", gap: 8 }}>
					<Button onClick={handleClosePreview} size="small">
						Cerrar
					</Button>
					<ButtonWithSpinner
						color="primary"
						variant="contained"
						size="small"
						loading={loading}
						onClick={handleAcceptFromPreview}
						startIcon={<CheckCircleOutlineIcon />}
					>
						{i18n.t("ticketsList.buttons.accept")}
					</ButtonWithSpinner>
				</DialogActions>
			</Dialog>

			<Divider variant="inset" component="li" />
		</React.Fragment>
	);
};

export default TicketListItem;
