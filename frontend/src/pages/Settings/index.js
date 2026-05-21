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
}));

const Settings = () => {
	const classes = useStyles();

	const [settings, setSettings] = useState([]);
	const [aiSystemPrompt, setAiSystemPrompt] = useState("");
	const [aiEscalationMessage, setAiEscalationMessage] = useState("");

	useEffect(() => {
		const fetchSession = async () => {
			try {
				const { data } = await api.get("/settings");
				setSettings(data);
				const promptSetting = data.find(s => s.key === "aiSystemPrompt");
				const escalationSetting = data.find(s => s.key === "aiEscalationMessage");
				if (promptSetting) setAiSystemPrompt(promptSetting.value);
				if (escalationSetting) setAiEscalationMessage(escalationSetting.value);
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
					const settingIndex = aux.findIndex(s => s.key === data.setting.key);
					aux[settingIndex].value = data.setting.value;
					return aux;
				});
			}
		});

		return () => {
			socket.disconnect();
		};
	}, []);

	const handleChangeSetting = async e => {
		const selectedValue = e.target.value;
		const settingKey = e.target.name;

		try {
			await api.put(`/settings/${settingKey}`, {
				value: selectedValue,
			});
			toast.success(i18n.t("settings.success"));
		} catch (err) {
			toastError(err);
		}
	};

	const getSettingValue = key => {
		const setting = settings.find(s => s.key === key);
		return setting ? setting.value : "";
	};

	const handleSaveTextSetting = async (key, value) => {
		try {
			await api.put(`/settings/${key}`, { value });
			toast.success(i18n.t("settings.success"));
		} catch (err) {
			toastError(err);
		}
	};

	return (
		<div className={classes.root}>
			<Container className={classes.container} maxWidth="sm">
				<Typography variant="body2" gutterBottom>
					{i18n.t("settings.title")}
				</Typography>
				<Paper className={classes.paper}>
					<Typography variant="body1">
						{i18n.t("settings.settings.userCreation.name")}
					</Typography>
					<Select
						margin="dense"
						variant="outlined"
						native
						id="userCreation-setting"
						name="userCreation"
						value={
							settings && settings.length > 0 && getSettingValue("userCreation")
						}
						className={classes.settingOption}
						onChange={handleChangeSetting}
					>
						<option value="enabled">
							{i18n.t("settings.settings.userCreation.options.enabled")}
						</option>
						<option value="disabled">
							{i18n.t("settings.settings.userCreation.options.disabled")}
						</option>
					</Select>

				</Paper>

				<Paper className={classes.paper}>
					<TextField
						id="api-token-setting"
						readonly
						label="Token Api"
						margin="dense"
						variant="outlined"
						fullWidth
						value={settings && settings.length > 0 && getSettingValue("userApiToken")}
					/>
				</Paper>

				<Divider style={{ margin: "16px 0" }} />

				<Typography variant="body1" className={classes.sectionTitle}>
					🤖 {i18n.t("aiChat.settings.title")}
				</Typography>

				<Paper className={classes.paper}>
					<Typography variant="body1">
						{i18n.t("aiChat.settings.enabled")}
					</Typography>
					<Select
						margin="dense"
						variant="outlined"
						native
						name="aiEnabled"
						value={settings && settings.length > 0 && getSettingValue("aiEnabled")}
						className={classes.settingOption}
						onChange={handleChangeSetting}
					>
						<option value="enabled">
							{i18n.t("aiChat.settings.options.enabled")}
						</option>
						<option value="disabled">
							{i18n.t("aiChat.settings.options.disabled")}
						</option>
					</Select>
				</Paper>

				<Paper className={classes.paper}>
					<Typography variant="body1">
						{i18n.t("aiChat.settings.maxAttempts")}
					</Typography>
					<TextField
						margin="dense"
						variant="outlined"
						type="number"
						name="aiMaxAttempts"
						inputProps={{ min: 1, max: 50 }}
						value={settings && settings.length > 0 && getSettingValue("aiMaxAttempts")}
						className={classes.settingOption}
						style={{ width: 80 }}
						onChange={handleChangeSetting}
					/>
				</Paper>

				<Paper className={classes.paperColumn}>
					<Typography variant="body1">
						{i18n.t("aiChat.settings.systemPrompt")}
					</Typography>
					<TextField
						multiline
						rows={6}
						margin="dense"
						variant="outlined"
						fullWidth
						value={aiSystemPrompt}
						onChange={e => setAiSystemPrompt(e.target.value)}
					/>
					<Button
						variant="contained"
						color="primary"
						size="small"
						className={classes.saveButton}
						onClick={() => handleSaveTextSetting("aiSystemPrompt", aiSystemPrompt)}
					>
						{i18n.t("aiChat.settings.save")}
					</Button>
				</Paper>

				<Paper className={classes.paperColumn}>
					<Typography variant="body1">
						{i18n.t("aiChat.settings.escalationMessage")}
					</Typography>
					<TextField
						multiline
						rows={3}
						margin="dense"
						variant="outlined"
						fullWidth
						value={aiEscalationMessage}
						onChange={e => setAiEscalationMessage(e.target.value)}
					/>
					<Button
						variant="contained"
						color="primary"
						size="small"
						className={classes.saveButton}
						onClick={() => handleSaveTextSetting("aiEscalationMessage", aiEscalationMessage)}
					>
						{i18n.t("aiChat.settings.save")}
					</Button>
				</Paper>

			</Container>
		</div>
	);
};

export default Settings;
