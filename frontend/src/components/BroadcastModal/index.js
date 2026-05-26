import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Typography,
  CircularProgress,
  makeStyles,
} from "@material-ui/core";
import SendIcon from "@material-ui/icons/Send";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 380,
  },
  colorDot: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: "50%",
    marginRight: 6,
    verticalAlign: "middle",
  },
}));

const BroadcastModal = ({ open, onClose }) => {
  const classes = useStyles();
  const [labels, setLabels] = useState([]);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [message, setMessage] = useState("");
  const [resolveTickets, setResolveTickets] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      api.get("/labels").then(({ data }) => setLabels(data)).catch(() => {});
    }
  }, [open]);

  const handleClose = () => {
    setSelectedLabel("");
    setMessage("");
    setResolveTickets(false);
    setSending(false);
    onClose();
  };

  const handleSend = async () => {
    if (!selectedLabel || !message.trim()) return;

    setSending(true);
    try {
      const { data } = await api.post(`/labels/${selectedLabel}/broadcast`, {
        message: message.trim(),
        resolveTickets,
      });
      toast.success(
        i18n.t("broadcast.success")
          .replace("{{sent}}", data.sent)
          .replace("{{total}}", data.total)
      );
      handleClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{i18n.t("broadcast.title")}</DialogTitle>
      <DialogContent>
        <div className={classes.form}>
          <FormControl fullWidth variant="outlined" size="small">
            <InputLabel>{i18n.t("broadcast.labelSelect")}</InputLabel>
            <Select
              value={selectedLabel}
              onChange={e => setSelectedLabel(e.target.value)}
              label={i18n.t("broadcast.labelSelect")}
            >
              {labels.map(label => (
                <MenuItem key={label.id} value={label.id}>
                  <span
                    className={classes.colorDot}
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label={i18n.t("broadcast.message")}
            multiline
            minRows={4}
            variant="outlined"
            fullWidth
            value={message}
            onChange={e => setMessage(e.target.value)}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={resolveTickets}
                onChange={e => setResolveTickets(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography variant="body2">
                {i18n.t("broadcast.resolveTickets")}
              </Typography>
            }
          />
        </div>
      </DialogContent>
      <DialogActions style={{ padding: "8px 16px", gap: 8 }}>
        <Button onClick={handleClose}>{i18n.t("broadcast.cancel")}</Button>
        <Button
          variant="contained"
          color="primary"
          startIcon={sending ? <CircularProgress size={16} /> : <SendIcon />}
          onClick={handleSend}
          disabled={sending || !selectedLabel || !message.trim()}
        >
          {i18n.t("broadcast.send")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BroadcastModal;
