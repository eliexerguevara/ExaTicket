import React, { useState, useEffect, useRef } from "react";
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	CircularProgress,
	TextField,
	List,
	ListItem,
	ListItemText,
	ListItemAvatar,
	Avatar,
	Typography,
	Box,
	makeStyles,
	Divider,
} from "@material-ui/core";
import {
	CheckCircleOutline,
	PersonOutline,
	SearchOutlined,
	AssignmentOutlined,
} from "@material-ui/icons";
import { green } from "@material-ui/core/colors";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
	dialogTitle: {
		paddingBottom: theme.spacing(1),
	},
	choiceContainer: {
		display: "flex",
		flexDirection: "column",
		gap: theme.spacing(2),
		padding: theme.spacing(1, 0),
		minWidth: 320,
	},
	choiceButton: {
		padding: theme.spacing(1.5, 3),
		fontSize: "0.95rem",
		fontWeight: 600,
	},
	documentBtn: {
		backgroundColor: theme.palette.primary.main,
		color: "#fff",
		"&:hover": { backgroundColor: theme.palette.primary.dark },
	},
	noDocBtn: {
		borderColor: theme.palette.grey[400],
		color: theme.palette.text.secondary,
	},
	searchBox: {
		padding: theme.spacing(1, 0),
		minWidth: 360,
	},
	customerList: {
		maxHeight: 260,
		overflowY: "auto",
		border: `1px solid ${theme.palette.divider}`,
		borderRadius: 4,
		marginTop: theme.spacing(1),
	},
	customerItem: {
		cursor: "pointer",
		"&:hover": { backgroundColor: theme.palette.action.hover },
	},
	avatar: {
		backgroundColor: theme.palette.primary.light,
		color: theme.palette.primary.contrastText,
		width: 36,
		height: 36,
	},
	loadingBox: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: theme.spacing(2),
		padding: theme.spacing(3, 1),
		minWidth: 320,
	},
	successBox: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: theme.spacing(1.5),
		padding: theme.spacing(3, 1),
		minWidth: 320,
	},
	successIcon: {
		fontSize: 56,
		color: green[500],
	},
	emptyText: {
		textAlign: "center",
		padding: theme.spacing(2),
		color: theme.palette.text.secondary,
	},
	searchingText: {
		textAlign: "center",
		padding: theme.spacing(1),
		color: theme.palette.text.secondary,
		fontSize: "0.85rem",
	},
}));

// Steps: 'choice' | 'search' | 'loading' | 'success'
const SplynxDocumentModal = ({ open, ticket, onClose, onResolveDirect }) => {
	const classes = useStyles();
	const [step, setStep] = useState("choice");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState([]);
	const [searching, setSearching] = useState(false);
	const [splynxTicketId, setSplynxTicketId] = useState(null);
	const debounceRef = useRef(null);

	// Reset state when modal opens
	useEffect(() => {
		if (open) {
			setStep("choice");
			setSearchQuery("");
			setSearchResults([]);
			setSplynxTicketId(null);
		}
	}, [open]);

	// Debounced search
	useEffect(() => {
		if (step !== "search") return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (searchQuery.trim().length < 2) {
			setSearchResults([]);
			setSearching(false);
			return;
		}
		setSearching(true);
		debounceRef.current = setTimeout(async () => {
			try {
				const { data } = await api.get("/splynx/customers/search", {
					params: { name: searchQuery.trim() },
				});
				setSearchResults(Array.isArray(data) ? data : []);
			} catch (err) {
				toastError(err);
				setSearchResults([]);
			} finally {
				setSearching(false);
			}
		}, 400);
		return () => clearTimeout(debounceRef.current);
	}, [searchQuery, step]);

	const handleSelectCustomer = async customer => {
		setStep("loading");
		try {
			const { data } = await api.post(`/splynx/document/${ticket.id}`, {
				splynxCustomerId: customer.id,
			});
			setSplynxTicketId(data.splynxTicketId);
			setStep("success");
		} catch (err) {
			toastError(err);
			setStep("search");
		}
	};

	const handleClose = () => {
		onClose();
	};

	return (
		<Dialog open={open} onClose={step === "loading" ? undefined : handleClose} maxWidth="xs" fullWidth>
			{/* ── CHOICE ── */}
			{step === "choice" && (
				<>
					<DialogTitle className={classes.dialogTitle}>
						<Box display="flex" alignItems="center" gap={1}>
							<AssignmentOutlined color="primary" style={{ marginRight: 8 }} />
							Resolver ticket
						</Box>
					</DialogTitle>
					<DialogContent>
						<div className={classes.choiceContainer}>
							<Button
								variant="contained"
								className={`${classes.choiceButton} ${classes.documentBtn}`}
								fullWidth
								onClick={() => setStep("search")}
								startIcon={<PersonOutline />}
							>
								Documentar en Splynx
							</Button>
							<Button
								variant="outlined"
								className={`${classes.choiceButton} ${classes.noDocBtn}`}
								fullWidth
								onClick={onResolveDirect}
							>
								No documentar
							</Button>
						</div>
					</DialogContent>
				</>
			)}

			{/* ── SEARCH ── */}
			{step === "search" && (
				<>
					<DialogTitle className={classes.dialogTitle}>
						<Box display="flex" alignItems="center">
							<SearchOutlined color="primary" style={{ marginRight: 8 }} />
							Buscar cliente en Splynx
						</Box>
					</DialogTitle>
					<DialogContent>
						<div className={classes.searchBox}>
							<TextField
								autoFocus
								fullWidth
								variant="outlined"
								size="small"
								label="Nombre del cliente"
								placeholder="Ej: Lourdes Rios..."
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
								InputProps={{
									endAdornment: searching ? <CircularProgress size={18} /> : null,
								}}
							/>
							{searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
								<Typography className={classes.emptyText}>
									No se encontraron clientes con ese nombre
								</Typography>
							)}
							{searching && (
								<Typography className={classes.searchingText}>Buscando...</Typography>
							)}
							{searchResults.length > 0 && (
								<List className={classes.customerList} disablePadding>
									{searchResults.map((customer, idx) => (
										<React.Fragment key={customer.id}>
											{idx > 0 && <Divider />}
											<ListItem
												className={classes.customerItem}
												onClick={() => handleSelectCustomer(customer)}
											>
												<ListItemAvatar>
													<Avatar className={classes.avatar}>
														{(customer.name || "?")[0].toUpperCase()}
													</Avatar>
												</ListItemAvatar>
												<ListItemText
													primary={customer.name}
													secondary={customer.phone || "—"}
												/>
											</ListItem>
										</React.Fragment>
									))}
								</List>
							)}
						</div>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setStep("choice")} color="default" size="small">
							Volver
						</Button>
					</DialogActions>
				</>
			)}

			{/* ── LOADING ── */}
			{step === "loading" && (
				<DialogContent>
					<div className={classes.loadingBox}>
						<CircularProgress size={48} />
						<Typography variant="body1" align="center">
							Generando resumen con IA y creando ticket en Splynx...
						</Typography>
					</div>
				</DialogContent>
			)}

			{/* ── SUCCESS ── */}
			{step === "success" && (
				<>
					<DialogContent>
						<div className={classes.successBox}>
							<CheckCircleOutline className={classes.successIcon} />
							<Typography variant="h6" align="center">
								¡Documentado!
							</Typography>
							<Typography variant="body2" align="center" color="textSecondary">
								Ticket Splynx #{splynxTicketId} creado con resumen del chat.
								El caso ha sido cerrado.
							</Typography>
						</div>
					</DialogContent>
					<DialogActions>
						<Button onClick={handleClose} color="primary" variant="contained">
							Aceptar
						</Button>
					</DialogActions>
				</>
			)}
		</Dialog>
	);
};

export default SplynxDocumentModal;
