import React, { useState, useEffect, useCallback } from "react";
import {
  makeStyles,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Typography,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
} from "@material-ui/core";
import AddIcon from "@material-ui/icons/Add";
import EditIcon from "@material-ui/icons/Edit";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import SendIcon from "@material-ui/icons/Send";
import { toast } from "react-toastify";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import BroadcastModal from "../../components/BroadcastModal";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 4,
    display: "inline-block",
    border: "1px solid rgba(0,0,0,0.12)",
  },
  colorPreview: {
    width: 32,
    height: 32,
    borderRadius: 4,
    marginTop: 4,
    border: "1px solid rgba(0,0,0,0.2)",
  },
  formRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-end",
  },
}));

// ── Label Modal ───────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#6b7280", "#0ea5e9", "#14b8a6",
];

const LabelModal = ({ open, onClose, onSaved, editLabel }) => {
  const classes = useStyles();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editLabel) {
      setName(editLabel.name);
      setColor(editLabel.color);
    } else {
      setName("");
      setColor("#6b7280");
    }
  }, [editLabel, open]);

  const handleSave = async () => {
    if (!name.trim() || !color) return;
    setSaving(true);
    try {
      if (editLabel) {
        await api.put(`/labels/${editLabel.id}`, { name: name.trim(), color });
      } else {
        await api.post("/labels", { name: name.trim(), color });
      }
      toast.success(i18n.t("labelModal.success"));
      onSaved();
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {editLabel ? i18n.t("labelModal.title.edit") : i18n.t("labelModal.title.add")}
      </DialogTitle>
      <DialogContent>
        <TextField
          label={i18n.t("labelModal.form.name")}
          fullWidth
          variant="outlined"
          size="small"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <Typography variant="caption" color="textSecondary">
          {i18n.t("labelModal.form.color")}
        </Typography>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {PRESET_COLORS.map(c => (
            <div
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                backgroundColor: c,
                cursor: "pointer",
                border: color === c ? "3px solid #000" : "2px solid transparent",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            style={{ cursor: "pointer", width: 36, height: 36, border: "none", padding: 0 }}
          />
          <Typography variant="body2" color="textSecondary">
            {color}
          </Typography>
          <div
            className={classes.colorSwatch}
            style={{ backgroundColor: color, marginLeft: 4 }}
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{i18n.t("labelModal.buttons.cancel")}</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {i18n.t("labelModal.buttons.ok")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Labels Page ───────────────────────────────────────────────────────────────
const Labels = () => {
  const classes = useStyles();
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLabel, setEditLabel] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingLabel, setDeletingLabel] = useState(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const fetchLabels = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/labels");
      setLabels(data);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  const handleDelete = async () => {
    if (!deletingLabel) return;
    try {
      await api.delete(`/labels/${deletingLabel.id}`);
      toast.success(i18n.t("labels.toasts.deleted"));
      fetchLabels();
    } catch (err) {
      toastError(err);
    }
    setDeletingLabel(null);
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title={i18n.t("labels.confirmationModal.deleteTitle")}
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      >
        {i18n.t("labels.confirmationModal.deleteMessage")}
      </ConfirmationModal>

      <LabelModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditLabel(null); }}
        onSaved={fetchLabels}
        editLabel={editLabel}
      />

      <BroadcastModal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
      />

      <MainHeader>
        <Title>{i18n.t("labels.title")}</Title>
        <MainHeaderButtonsWrapper>
          <Tooltip title={i18n.t("broadcast.title")}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<SendIcon />}
              onClick={() => setBroadcastOpen(true)}
              style={{ marginRight: 8 }}
            >
              {i18n.t("broadcast.title")}
            </Button>
          </Tooltip>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => { setEditLabel(null); setModalOpen(true); }}
          >
            {i18n.t("labels.buttons.add")}
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.mainPaper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{i18n.t("labels.table.color")}</TableCell>
              <TableCell>{i18n.t("labels.table.name")}</TableCell>
              <TableCell align="right">{i18n.t("labels.table.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} align="center" style={{ padding: 32 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : (
              labels.map(label => (
                <TableRow key={label.id} hover>
                  <TableCell>
                    <span
                      className={classes.colorSwatch}
                      style={{ backgroundColor: label.color }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{label.name}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Editar">
                      <IconButton
                        size="small"
                        onClick={() => { setEditLabel(label); setModalOpen(true); }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton
                        size="small"
                        onClick={() => { setDeletingLabel(label); setConfirmOpen(true); }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Paper>
    </MainContainer>
  );
};

export default Labels;
