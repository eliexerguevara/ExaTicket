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

// ── Inline channel icons (MUI v4 has no WA/TG icons) ──────────────────────────
const WhatsAppSvg = () => (
	<svg viewBox="0 0 24 24" width="9" height="9" fill="white">
		<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
	</svg>
);

const TelegramSvg = () => (
	<svg viewBox="0 0 24 24" width="9" height="9" fill="white">
		<path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
	</svg>
);

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
		alignItems: "center",
		gap: 4,
	},

	lastMessageTime: {
		flexShrink: 0,
		marginLeft: "auto",
	},

	closedBadge: {
		alignSelf: "center",
		flexShrink: 0,
		marginRight: 8,
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

	avatarWrapper: {
		position: "relative",
		display: "inline-block",
	},

	channelBadge: {
		position: "absolute",
		bottom: 1,
		right: 1,
		width: 18,
		height: 18,
		borderRadius: "50%",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		border: "2px solid #fff",
		boxSizing: "border-box",
	},

	waBadge: {
		background: "#25D366",
	},

	tgBadge: {
		background: "#2CA5E0",
	},

	channelChip: {
		display: "inline-flex",
		alignItems: "center",
		padding: "1px 5px",
		borderRadius: 4,
		fontSize: "0.68em",
		fontWeight: 700,
		color: "#fff",
		lineHeight: 1.6,
		letterSpacing: "0.02em",
		flexShrink: 0,
	},

	waChip: {
		background: "#25D366",
	},

	tgChip: {
		background: "#2CA5E0",
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

	typingText: {
		color: "#16a34a",
		fontSize: "0.82em",
		fontStyle: "italic",
		fontWeight: 500,
	},

	labelsRow: {
		display: "flex",
		flexWrap: "wrap",
		gap: 3,
		marginTop: 2,
	},

	labelChip: {
		display: "inline-flex",
		alignItems: "center",
		padding: "1px 6px",
		borderRadius: 8,
		fontSize: "0.7em",
		fontWeight: 600,
		color: "#fff",
		lineHeight: 1.4,
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

const TicketListItem = ({ ticket, isTyping = false }) => {
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
					<div className={classes.avatarWrapper}>
						<Avatar src={ticket?.contact?.profilePicUrl} />
						{ticket.whatsappId && (
							<span className={clsx(classes.channelBadge, classes.waBadge)}>
								<WhatsAppSvg />
							</span>
						)}
						{ticket.telegramId && (
							<span className={clsx(classes.channelBadge, classes.tgBadge)}>
								<TelegramSvg />
							</span>
						)}
					</div>
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
							{ticket.whatsappId && (
								<span className={clsx(classes.channelChip, classes.waChip)} title={ticket.whatsapp?.name || "WhatsApp"}>
									WA
								</span>
							)}
							{ticket.telegramId && (
								<span className={clsx(classes.channelChip, classes.tgChip)} title={ticket.telegram?.name || "Telegram"}>
									TG
								</span>
							)}
							{ticket.status === "closed" && (
								<Badge
									className={classes.closedBadge}
									badgeContent={"closed"}
									color="primary"
								/>
							)}
							{ticket.aiActive && !ticket.isGroup && ticket.status !== "closed" && (
								<Tooltip title={i18n.t("aiChat.aiHandling")}>
									<div className={classes.aiTag}>
										<Android style={{ fontSize: 11 }} />
										IA
									</div>
								</Tooltip>
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
						</span>
					}
					secondary={
						<span>
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
											{isTyping ? (
												<span className={classes.typingText}>
													{i18n.t("typing.label")}
												</span>
											) : ticket.lastMessage ? (
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
							{/* Label chips */}
							{ticket.labels && ticket.labels.length > 0 && (
								<span className={classes.labelsRow}>
									{ticket.labels.map(label => (
										<span
											key={label.id}
											className={classes.labelChip}
											style={{ backgroundColor: label.color }}
										>
											{label.name}
										</span>
									))}
								</span>
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
