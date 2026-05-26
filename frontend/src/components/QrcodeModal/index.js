import React, { useEffect, useState } from "react";
import QRCode from "qrcode.react";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  Paper,
  Typography,
  Tabs,
  Tab,
  TextField,
  Button,
  CircularProgress,
  makeStyles,
  InputAdornment,
  IconButton,
} from "@material-ui/core";
import PhoneIcon from "@material-ui/icons/Phone";
import CropFreeIcon from "@material-ui/icons/CropFree";
import RefreshIcon from "@material-ui/icons/Refresh";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";

const useStyles = makeStyles(theme => ({
  qrWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px 0",
    gap: 12,
  },
  codeWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    padding: "16px 0",
    minWidth: 300,
  },
  pairingCode: {
    fontFamily: "monospace",
    fontSize: "2.4rem",
    fontWeight: 700,
    letterSpacing: "0.25em",
    color: theme.palette.primary.main,
    background: theme.palette.type === "dark" ? "#1e293b" : "#f0f9ff",
    padding: "12px 28px",
    borderRadius: 10,
    border: `2px solid ${theme.palette.primary.main}`,
    userSelect: "all",
  },
  instructions: {
    color: theme.palette.text.secondary,
    fontSize: "0.85em",
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 1.5,
  },
  waiting: {
    color: theme.palette.text.disabled,
    fontStyle: "italic",
    fontSize: "0.9em",
  },
}));

// ── QR tab ────────────────────────────────────────────────────────────────────
const QRTab = ({ whatsAppId, onClose }) => {
  const classes = useStyles();
  const [qrCode, setQrCode] = useState("");

  useEffect(() => {
    const fetchSession = async () => {
      if (!whatsAppId) return;
      try {
        const { data } = await api.get(`/whatsapp/${whatsAppId}`);
        setQrCode(data.qrcode);
      } catch (err) {
        toastError(err);
      }
    };
    fetchSession();
  }, [whatsAppId]);

  useEffect(() => {
    if (!whatsAppId) return;
    const socket = openSocket();

    socket.on("whatsappSession", data => {
      if (data.action === "update" && data.session.id === whatsAppId) {
        setQrCode(data.session.qrcode);
      }
      if (data.action === "update" && data.session.qrcode === "") {
        onClose();
      }
    });

    return () => socket.disconnect();
  }, [whatsAppId, onClose]);

  return (
    <div className={classes.qrWrapper}>
      <Typography variant="body2" color="textSecondary">
        {i18n.t("qrCode.message")}
      </Typography>
      {qrCode ? (
        <QRCode value={qrCode} size={256} />
      ) : (
        <div style={{ height: 256, display: "flex", alignItems: "center" }}>
          <CircularProgress size={40} />
        </div>
      )}
    </div>
  );
};

// ── Pairing code tab ──────────────────────────────────────────────────────────
const PairingTab = ({ whatsAppId, onClose }) => {
  const classes = useStyles();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Listen for connection — auto-close on success
  useEffect(() => {
    if (!whatsAppId) return;
    const socket = openSocket();
    socket.on("whatsappSession", data => {
      if (
        data.action === "update" &&
        data.session.id === whatsAppId &&
        data.session.qrcode === ""
      ) {
        onClose();
      }
    });
    return () => socket.disconnect();
  }, [whatsAppId, onClose]);

  const handleRequest = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) {
      setError(i18n.t("connections.pairingCode.phoneError"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post(
        `/whatsappsession/${whatsAppId}/pairingcode`,
        { phoneNumber: digits }
      );
      setCode(data.code);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setCode("");
    handleRequest();
  };

  return (
    <div className={classes.codeWrapper}>
      {!code ? (
        <>
          <Typography variant="body2" className={classes.instructions}>
            {i18n.t("connections.pairingCode.instructions")}
          </Typography>
          <TextField
            label={i18n.t("connections.pairingCode.phoneLabel")}
            placeholder="573123456789"
            variant="outlined"
            size="small"
            fullWidth
            value={phone}
            onChange={e => setPhone(e.target.value)}
            error={!!error}
            helperText={error || i18n.t("connections.pairingCode.phoneHelper")}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PhoneIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
            onKeyDown={e => e.key === "Enter" && handleRequest()}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleRequest}
            disabled={loading || phone.replace(/\D/g, "").length < 8}
            startIcon={loading ? <CircularProgress size={16} /> : undefined}
            fullWidth
          >
            {loading
              ? i18n.t("connections.pairingCode.generating")
              : i18n.t("connections.pairingCode.generate")}
          </Button>
        </>
      ) : (
        <>
          <Typography variant="body2" className={classes.instructions}>
            {i18n.t("connections.pairingCode.enterCode")}
          </Typography>
          <div className={classes.pairingCode}>{code}</div>
          <Typography variant="caption" className={classes.instructions}>
            {i18n.t("connections.pairingCode.steps")}
          </Typography>
          <Typography variant="caption" className={classes.waiting}>
            {i18n.t("connections.pairingCode.waiting")}
          </Typography>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
          >
            {i18n.t("connections.pairingCode.newCode")}
          </Button>
        </>
      )}
    </div>
  );
};

// ── Main modal ────────────────────────────────────────────────────────────────
const QrcodeModal = ({ open, onClose, whatsAppId }) => {
  const [tab, setTab] = useState(0);

  // Reset tab when modal opens
  useEffect(() => {
    if (open) setTab(0);
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" scroll="paper">
      <DialogTitle style={{ paddingBottom: 0 }}>
        {i18n.t("connections.qrModal.title")}
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        indicatorColor="primary"
        textColor="primary"
        variant="fullWidth"
      >
        <Tab
          label={i18n.t("connections.qrModal.tabQr")}
          icon={<CropFreeIcon fontSize="small" />}
        />
        <Tab
          label={i18n.t("connections.qrModal.tabCode")}
          icon={<PhoneIcon fontSize="small" />}
        />
      </Tabs>
      <DialogContent>
        <Paper elevation={0}>
          {tab === 0 && (
            <QRTab whatsAppId={whatsAppId} onClose={onClose} />
          )}
          {tab === 1 && (
            <PairingTab whatsAppId={whatsAppId} onClose={onClose} />
          )}
        </Paper>
      </DialogContent>
    </Dialog>
  );
};

export default React.memo(QrcodeModal);
