import React, { useState, useEffect } from "react";
import openSocket from "../../services/socket-io";

import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Container from "@material-ui/core/Container";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import CircularProgress from "@material-ui/core/CircularProgress";
import InputAdornment from "@material-ui/core/InputAdornment";
import IconButton from "@material-ui/core/IconButton";
import Accordion from "@material-ui/core/Accordion";
import AccordionSummary from "@material-ui/core/AccordionSummary";
import AccordionDetails from "@material-ui/core/AccordionDetails";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import VisibilityIcon from "@material-ui/icons/Visibility";
import VisibilityOffIcon from "@material-ui/icons/VisibilityOff";
import { green, red } from "@material-ui/core/colors";
import { toast } from "react-toastify";

import api from "../../services/api";
import { i18n } from "../../translate/i18n.js";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
	root: {
		display: "flex",
		alignItems: "center",
		padding: theme.spacing(8, 8, 3),
	},
	paper: {
		padding: theme.spacing(2),
		display: "flex",
		alignItems: "center",
		marginBottom: 12,
	},
	paperColumn: {
		padding: theme.spacing(2),
		display: "flex",
		flexDirection: "column",
		gap: theme.spacing(2),
		marginBottom: 12,
	},
	settingOption: {
		marginLeft: "auto",
	},
	margin: {
		margin: theme.spacing(1),
	},
	sectionTitle: {
		fontWeight: 600,
		marginBottom: theme.spacing(1),
		marginTop: theme.spacing(2),
		display: "flex",
		alignItems: "center",
		gap: theme.spacing(1),
	},
	saveButton: {
		alignSelf: "flex-end",
	},
	// Splynx accordion
	accordionRoot: {
		marginBottom: 12,
		"&:before": { display: "none" },
		boxShadow: "0px 2px 1px -1px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14),0px 1px 3px 0px rgba(0,0,0,0.12)",
		borderRadius: "4px !important",
	},
	accordionSummary: {
		backgroundColor: "#f0fdf4",
		borderRadius: 4,
		fontWeight: 600,
	},
	accordionDetails: {
		flexDirection: "column",
		gap: theme.spacing(2),
		display: "flex",
		padding: theme.spacing(2),
	},
	testOk: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		color: green[700],
		fontSize: "0.85rem",
	},
	testFail: {
		display: "flex",
		alignItems: "center",
		gap: 6,
		color: red[700],
		fontSize: "0.85rem",
	},
	btnRow: {
		display: "flex",
		gap: 8,
		justifyContent: "flex-end",
		marginTop: 4,
	},
}));

const Settings = () => {
	const classes = useStyles();

	const [settings, setSettings] = useState([]);
	const [aiSystemPrompt, setAiSystemPrompt] = useState("");
	const [aiEscalationMessage, setAiEscalationMessage] = useState("");

	// Splynx state
	const [splynxApiUrl, setSplynxApiUrl] = useState("");
	const [splynxApiKey, setSplynxApiKey] = useState("");
	const [splynxApiSecret, setSplynxApiSecret] = useState("");
	const [splynxAdminLogin, setSplynxAdminLogin] = useState("");
	const [splynxAdminPassword, setSplynxAdminPassword] = useState("");
	const [showSecret, setShowSecret] = useState(false);
	const [showAdminPwd, setShowAdminPwd] = useState(false);
	const [testingConn, setTestingConn] = useState(false);
	const [testResult, setTestResult] = useState(null); // { ok, message }

	// Zabbix state
	const [zabbixApiUrl, setZabbixApiUrl] = useState("");
	const [zabbixApiToken, setZabbixApiToken] = useState("");
	const [zabbixApiUser, setZabbixApiUser] = useState("");
	const [zabbixApiPassword, setZabbixApiPassword] = useState("");
	const [showZabbixToken, setShowZabbixToken] = useState(false);
	const [showZabbixPwd, setShowZabbixPwd] = useState(false);
	const [testingZabbix, setTestingZabbix] = useState(false);
	const [zabbixTestResult, setZabbixTestResult] = useState(null); // { ok, message }

	useEffect(() => {
		const fetchSession = async () => {
			try {
				const { data } = await api.get("/settings");
				setSettings(data);

				const find = key => (data.find(s => s.key === key) || {}).value || "";
				setAiSystemPrompt(find("aiSystemPrompt"));
				setAiEscalationMessage(find("aiEscalationMessage"));
				setSplynxApiUrl(find("splynxApiUrl"));
				setSplynxApiKey(find("splynxApiKey"));
				setSplynxApiSecret(find("splynxApiSecret"));
				setSplynxAdminLogin(find("splynxAdminLogin"));
				setSplynxAdminPassword(find("splynxAdminPassword"));
				setZabbixApiUrl(find("zabbixApiUrl"));
				setZabbixApiToken(find("zabbixApiToken"));
				setZabbixApiUser(find("zabbixApiUser"));
				setZabbixApiPassword(find("zabbixApiPassword"));
			} catch (err) {
				toastError(err);
			}
		};
		fetchSession();
	}, []);

	useEffect(() => {
		const socket = openSocket();
		socket.on("settings", data => {
			if (data.action === "update") {
				setSettings(prevState => {
					const aux = [...prevState];
					const idx = aux.findIndex(s => s.key === data.setting.key);
					if (idx >= 0) aux[idx].value = data.setting.value;
					return aux;
				});
			}
		});
		return () => { socket.disconnect(); };
	}, []);

	const handleChangeSetting = async e => {
		const { name, value } = e.target;
		try {
			await api.put(`/settings/${name}`, { value });
			toast.success(i18n.t("settings.success"));
		} catch (err) {
			toastError(err);
		}
	};

	const getSettingValue = key => {
		const s = settings.find(x => x.key === key);
		return s ? s.value : "";
	};

	const handleSaveText = async (key, value) => {
		try {
			await api.put(`/settings/${key}`, { value });
			toast.success(i18n.t("settings.success"));
		} catch (err) {
			toastError(err);
		}
	};

	const handleSaveSplynx = async () => {
		try {
			await Promise.all([
				api.put("/settings/splynxApiUrl",        { value: splynxApiUrl }),
				api.put("/settings/splynxApiKey",        { value: splynxApiKey }),
				api.put("/settings/splynxApiSecret",     { value: splynxApiSecret }),
				api.put("/settings/splynxAdminLogin",    { value: splynxAdminLogin }),
				api.put("/settings/splynxAdminPassword", { value: splynxAdminPassword }),
			]);
			toast.success(i18n.t("settings.success"));
		} catch (err) {
			toastError(err);
		}
	};

	const handleTestSplynx = async () => {
		setTestingConn(true);
		setTestResult(null);
		try {
			const { data } = await api.post("/splynx/test-connection", {
				apiUrl:        splynxApiUrl,
				apiKey:        splynxApiKey,
				apiSecret:     splynxApiSecret,
				adminLogin:    splynxAdminLogin,
				adminPassword: splynxAdminPassword,
			});
			setTestResult(data);
		} catch {
			setTestResult({ ok: false, message: "Error al conectar con el servidor" });
		} finally {
			setTestingConn(false);
		}
	};

	const handleSaveZabbix = async () => {
		try {
			await Promise.all([
				api.put("/settings/zabbixApiUrl",      { value: zabbixApiUrl }),
				api.put("/settings/zabbixApiToken",    { value: zabbixApiToken }),
				api.put("/settings/zabbixApiUser",     { value: zabbixApiUser }),
				api.put("/settings/zabbixApiPassword", { value: zabbixApiPassword }),
			]);
			toast.success(i18n.t("settings.success"));
		} catch (err) {
			toastError(err);
		}
	};

	const handleTestZabbix = async () => {
		setTestingZabbix(true);
		setZabbixTestResult(null);
		try {
			const { data } = await api.post("/zabbix/test-connection", {
				apiUrl:      zabbixApiUrl,
				apiToken:    zabbixApiToken,
				apiUser:     zabbixApiUser,
				apiPassword: zabbixApiPassword,
			});
			setZabbixTestResult(data);
		} catch {
			setZabbixTestResult({ ok: false, message: "Error al conectar con el servidor Zabbix" });
		} finally {
			setTestingZabbix(false);
		}
	};

	return (
		<div className={classes.root}>
			<Container maxWidth="sm">
				<Typography variant="body2" gutterBottom>
					{i18n.t("settings.title")}
				</Typography>

				{/* ── Creación de usuarios ─────────────────────────────── */}
				<Paper className={classes.paper}>
					<Typography variant="body1">
						{i18n.t("settings.settings.userCreation.name")}
					</Typography>
					<Select
						margin="dense"
						variant="outlined"
						native
						name="userCreation"
						value={settings.length > 0 ? getSettingValue("userCreation") : ""}
						className={classes.settingOption}
						onChange={handleChangeSetting}
					>
						<option value="enabled">{i18n.t("settings.settings.userCreation.options.enabled")}</option>
						<option value="disabled">{i18n.t("settings.settings.userCreation.options.disabled")}</option>
					</Select>
				</Paper>

				<Paper className={classes.paper}>
					<TextField
						label="Token Api"
						margin="dense"
						variant="outlined"
						fullWidth
						InputProps={{ readOnly: true }}
						value={settings.length > 0 ? getSettingValue("userApiToken") : ""}
					/>
				</Paper>

				{/* ── IA de soporte ────────────────────────────────────── */}
				<Divider style={{ margin: "16px 0" }} />
				<Typography variant="body1" className={classes.sectionTitle}>
					🤖 {i18n.t("aiChat.settings.title")}
				</Typography>

				<Paper className={classes.paper}>
					<Typography variant="body1">{i18n.t("aiChat.settings.enabled")}</Typography>
					<Select
						margin="dense"
						variant="outlined"
						native
						name="aiEnabled"
						value={settings.length > 0 ? getSettingValue("aiEnabled") : "disabled"}
						className={classes.settingOption}
						onChange={handleChangeSetting}
					>
						<option value="enabled">{i18n.t("aiChat.settings.options.enabled")}</option>
						<option value="disabled">{i18n.t("aiChat.settings.options.disabled")}</option>
					</Select>
				</Paper>

				<Paper className={classes.paper}>
					<Typography variant="body1">{i18n.t("aiChat.settings.maxAttempts")}</Typography>
					<TextField
						margin="dense"
						variant="outlined"
						type="number"
						name="aiMaxAttempts"
						inputProps={{ min: 1, max: 50 }}
						value={settings.length > 0 ? getSettingValue("aiMaxAttempts") : "10"}
						className={classes.settingOption}
						style={{ width: 80 }}
						onChange={handleChangeSetting}
					/>
				</Paper>

				<Paper className={classes.paperColumn}>
					<Typography variant="body1">{i18n.t("aiChat.settings.systemPrompt")}</Typography>
					<TextField
						multiline
						rows={6}
						margin="dense"
						variant="outlined"
						fullWidth
						value={aiSystemPrompt}
						onChange={e => setAiSystemPrompt(e.target.value)}
					/>
					<Button variant="contained" color="primary" size="small" className={classes.saveButton}
						onClick={() => handleSaveText("aiSystemPrompt", aiSystemPrompt)}>
						{i18n.t("aiChat.settings.save")}
					</Button>
				</Paper>

				<Paper className={classes.paperColumn}>
					<Typography variant="body1">{i18n.t("aiChat.settings.escalationMessage")}</Typography>
					<TextField
						multiline
						rows={3}
						margin="dense"
						variant="outlined"
						fullWidth
						value={aiEscalationMessage}
						onChange={e => setAiEscalationMessage(e.target.value)}
					/>
					<Button variant="contained" color="primary" size="small" className={classes.saveButton}
						onClick={() => handleSaveText("aiEscalationMessage", aiEscalationMessage)}>
						{i18n.t("aiChat.settings.save")}
					</Button>
				</Paper>

				{/* ── Splynx ── Accordion / submenu ───────────────────── */}
				<Divider style={{ margin: "16px 0" }} />
				<Typography variant="body1" className={classes.sectionTitle}>
					🔌 {i18n.t("splynx.settings.title")}
				</Typography>

				{/* Enable/disable toggle */}
				<Paper className={classes.paper}>
					<Typography variant="body1">{i18n.t("splynx.settings.enabled")}</Typography>
					<Select
						margin="dense"
						variant="outlined"
						native
						name="splynxEnabled"
						value={settings.length > 0 ? getSettingValue("splynxEnabled") : "disabled"}
						className={classes.settingOption}
						onChange={handleChangeSetting}
					>
						<option value="enabled">{i18n.t("splynx.settings.options.enabled")}</option>
						<option value="disabled">{i18n.t("splynx.settings.options.disabled")}</option>
					</Select>
				</Paper>

				{/* Credentials accordion (collapsed by default) */}
				<Accordion className={classes.accordionRoot} defaultExpanded={false}>
					<AccordionSummary
						expandIcon={<ExpandMoreIcon />}
						className={classes.accordionSummary}
					>
						<Typography style={{ fontWeight: 600 }}>
							🔑 Credenciales de conexión Splynx
						</Typography>
					</AccordionSummary>
					<AccordionDetails className={classes.accordionDetails}>

						<TextField
							label={i18n.t("splynx.settings.apiUrl")}
							helperText={i18n.t("splynx.settings.apiUrlHelper")}
							margin="dense"
							variant="outlined"
							fullWidth
							value={splynxApiUrl}
							onChange={e => { setSplynxApiUrl(e.target.value); setTestResult(null); }}
						/>

						<TextField
							label={i18n.t("splynx.settings.apiKey")}
							margin="dense"
							variant="outlined"
							fullWidth
							value={splynxApiKey}
							onChange={e => { setSplynxApiKey(e.target.value); setTestResult(null); }}
						/>

						<TextField
							label={i18n.t("splynx.settings.apiSecret")}
							margin="dense"
							variant="outlined"
							fullWidth
							type={showSecret ? "text" : "password"}
							value={splynxApiSecret}
							onChange={e => { setSplynxApiSecret(e.target.value); setTestResult(null); }}
							InputProps={{
								endAdornment: (
									<InputAdornment position="end">
										<IconButton size="small" onClick={() => setShowSecret(v => !v)}>
											{showSecret ? <VisibilityOffIcon /> : <VisibilityIcon />}
										</IconButton>
									</InputAdornment>
								),
							}}
						/>

						<Typography variant="caption" style={{ marginTop: 12, display: "block", color: "#6b7280" }}>
							— o autenticación de administrador —
						</Typography>

						<TextField
							label="Usuario admin Splynx"
							helperText="Alternativa si la clave API no funciona"
							margin="dense"
							variant="outlined"
							fullWidth
							value={splynxAdminLogin}
							onChange={e => { setSplynxAdminLogin(e.target.value); setTestResult(null); }}
						/>

						<TextField
							label="Contraseña admin Splynx"
							margin="dense"
							variant="outlined"
							fullWidth
							type={showAdminPwd ? "text" : "password"}
							value={splynxAdminPassword}
							onChange={e => { setSplynxAdminPassword(e.target.value); setTestResult(null); }}
							InputProps={{
								endAdornment: (
									<InputAdornment position="end">
										<IconButton size="small" onClick={() => setShowAdminPwd(v => !v)}>
											{showAdminPwd ? <VisibilityOffIcon /> : <VisibilityIcon />}
										</IconButton>
									</InputAdornment>
								),
							}}
						/>

						{/* Connection test result */}
						{testResult && (
							<Typography className={testResult.ok ? classes.testOk : classes.testFail}>
								{testResult.ok ? "✅" : "❌"} {testResult.message}
							</Typography>
						)}

						<div className={classes.btnRow}>
							<Button
								variant="outlined"
								color="primary"
								size="small"
								disabled={testingConn || !splynxApiUrl || (!splynxApiKey && !splynxAdminLogin)}
								onClick={handleTestSplynx}
								startIcon={testingConn ? <CircularProgress size={14} /> : null}
							>
								{testingConn ? i18n.t("splynx.settings.testing") : i18n.t("splynx.settings.testConnection")}
							</Button>
							<Button
								variant="contained"
								color="primary"
								size="small"
								onClick={handleSaveSplynx}
							>
								{i18n.t("aiChat.settings.save")}
							</Button>
						</div>

					</AccordionDetails>
				</Accordion>

				{/* ── Zabbix ── Accordion / submenu ───────────────────── */}
				<Divider style={{ margin: "16px 0" }} />
				<Typography variant="body1" className={classes.sectionTitle}>
					📡 {i18n.t("zabbix.settings.title")}
				</Typography>

				{/* Enable/disable toggle */}
				<Paper className={classes.paper}>
					<Typography variant="body1">{i18n.t("zabbix.settings.enabled")}</Typography>
					<Select
						margin="dense"
						variant="outlined"
						native
						name="zabbixEnabled"
						value={settings.length > 0 ? getSettingValue("zabbixEnabled") : "disabled"}
						className={classes.settingOption}
						onChange={handleChangeSetting}
					>
						<option value="enabled">{i18n.t("zabbix.settings.options.enabled")}</option>
						<option value="disabled">{i18n.t("zabbix.settings.options.disabled")}</option>
					</Select>
				</Paper>

				{/* Credentials accordion */}
				<Accordion className={classes.accordionRoot} defaultExpanded={false}>
					<AccordionSummary
						expandIcon={<ExpandMoreIcon />}
						className={classes.accordionSummary}
					>
						<Typography style={{ fontWeight: 600 }}>
							🔑 {i18n.t("zabbix.settings.credentialsTitle")}
						</Typography>
					</AccordionSummary>
					<AccordionDetails className={classes.accordionDetails}>

						<TextField
							label={i18n.t("zabbix.settings.apiUrl")}
							helperText={i18n.t("zabbix.settings.apiUrlHelper")}
							margin="dense"
							variant="outlined"
							fullWidth
							value={zabbixApiUrl}
							onChange={e => { setZabbixApiUrl(e.target.value); setZabbixTestResult(null); }}
						/>

						{/* Auth Option A: API Token */}
						<Typography variant="caption" style={{ display: "block", color: "#6b7280", marginTop: 8 }}>
							{i18n.t("zabbix.settings.authTokenLabel")}
						</Typography>

						<TextField
							label={i18n.t("zabbix.settings.apiToken")}
							helperText={i18n.t("zabbix.settings.apiTokenHelper")}
							margin="dense"
							variant="outlined"
							fullWidth
							type={showZabbixToken ? "text" : "password"}
							value={zabbixApiToken}
							onChange={e => { setZabbixApiToken(e.target.value); setZabbixTestResult(null); }}
							InputProps={{
								endAdornment: (
									<InputAdornment position="end">
										<IconButton size="small" onClick={() => setShowZabbixToken(v => !v)}>
											{showZabbixToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
										</IconButton>
									</InputAdornment>
								),
							}}
						/>

						{/* Auth Option B: User / Password */}
						<Typography variant="caption" style={{ display: "block", color: "#6b7280", marginTop: 8 }}>
							{i18n.t("zabbix.settings.authUserLabel")}
						</Typography>

						<TextField
							label={i18n.t("zabbix.settings.apiUser")}
							helperText={i18n.t("zabbix.settings.apiUserHelper")}
							margin="dense"
							variant="outlined"
							fullWidth
							value={zabbixApiUser}
							onChange={e => { setZabbixApiUser(e.target.value); setZabbixTestResult(null); }}
						/>

						<TextField
							label={i18n.t("zabbix.settings.apiPassword")}
							margin="dense"
							variant="outlined"
							fullWidth
							type={showZabbixPwd ? "text" : "password"}
							value={zabbixApiPassword}
							onChange={e => { setZabbixApiPassword(e.target.value); setZabbixTestResult(null); }}
							InputProps={{
								endAdornment: (
									<InputAdornment position="end">
										<IconButton size="small" onClick={() => setShowZabbixPwd(v => !v)}>
											{showZabbixPwd ? <VisibilityOffIcon /> : <VisibilityIcon />}
										</IconButton>
									</InputAdornment>
								),
							}}
						/>

						{/* Connection test result */}
						{zabbixTestResult && (
							<Typography className={zabbixTestResult.ok ? classes.testOk : classes.testFail}>
								{zabbixTestResult.ok ? "✅" : "❌"} {zabbixTestResult.message}
							</Typography>
						)}

						<div className={classes.btnRow}>
							<Button
								variant="outlined"
								color="primary"
								size="small"
								disabled={testingZabbix || !zabbixApiUrl || (!zabbixApiToken && !zabbixApiUser)}
								onClick={handleTestZabbix}
								startIcon={testingZabbix ? <CircularProgress size={14} /> : null}
							>
								{testingZabbix ? i18n.t("zabbix.settings.testing") : i18n.t("zabbix.settings.testConnection")}
							</Button>
							<Button
								variant="contained"
								color="primary"
								size="small"
								onClick={handleSaveZabbix}
							>
								{i18n.t("aiChat.settings.save")}
							</Button>
						</div>

					</AccordionDetails>
				</Accordion>

			</Container>
		</div>
	);
};

export default Settings;
