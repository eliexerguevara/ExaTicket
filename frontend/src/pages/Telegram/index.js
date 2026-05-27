import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { green, red } from "@material-ui/core/colors";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Typography,
  Chip,
  CircularProgress,
  Tooltip,
} from "@material-ui/core";
import {
  Add,
  DeleteOutline,
  Edit,
  PowerSettingsNew,
  Cancel,
} from "@material-ui/icons";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
  statusConnected: {
    backgroundColor: green[500],
    color: "#fff",
  },
  statusDisconnected: {
    backgroundColor: theme.palette.grey[400],
    color: "#fff",
  },
  statusError: {
    backgroundColor: red[500],
    color: "#fff",
  },
  buttonProgress: {
    color: green[500],
  },
  actionButtons: {
    display: "flex",
    gap: theme.spacing(0.5),
    justifyContent: "center",
  },
}));

// ─── Add/Edit bot modal ───────────────────────────────────────────────────────

const TelegramModal = ({ open, onClose, telegramId, onSaved }) => {
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [greetingMessage, setGreetingMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (telegramId) {
      api.get(`/telegram`).then(({ data }) => {
        const tg = data.find(t => t.id === telegramId);
        if (tg) {
          setName(tg.name || "");
          setBotToken(tg.botToken || "");
          setGreetingMessage(tg.greetingMessage || "");
        }
      }).catch(toastError);
    } else {
      setName("");
      setBotToken("");
      setGreetingMessage("");
    }
  }, [open, telegramId]);

  const handleSave = async () => {
    if (!name.trim() || (!telegramId && !botToken.trim())) {
      toast.warn("Nombre y token son requeridos");
      return;
    }
    setSaving(true);
    try {
      if (telegramId) {
        await api.put(`/telegram/${telegramId}`, { name, greetingMessage });
        toast.success("Bot actualizado");
      } else {
        await api.post("/telegram", { name, botToken, greetingMessage });
        toast.success("Bot agregado y conectado");
      }
      onSaved();
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {telegramId ? "Editar bot de Telegram" : "Agregar bot de Telegram"}
      </DialogTitle>
      <DialogContent dividers>
        <TextField
          label="Nombre del bot"
          value={name}
          onChange={e => setName(e.target.value)}
          variant="outlined"
          fullWidth
          margin="dense"
          required
        />
        {!telegramId && (
          <TextField
            label="Token del bot (de @BotFather)"
            value={botToken}
            onChange={e => setBotToken(e.target.value)}
            variant="outlined"
            fullWidth
            margin="dense"
            required
            placeholder="1234567890:AAxxxxxxxxxxxxxxxx"
          />
        )}
        <TextField
          label="Mensaje de bienvenida (opcional)"
          value={greetingMessage}
          onChange={e => setGreetingMessage(e.target.value)}
          variant="outlined"
          fullWidth
          margin="dense"
          multiline
          rows={3}
          placeholder="¡Hola! Bienvenido al soporte de ExaTicket."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="primary"
          disabled={saving}
        >
          {saving ? <CircularProgress size={20} /> : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const TelegramPage = () => {
  const classes = useStyles();
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  const fetchBots = useCallback(async () => {
    try {
      const { data } = await api.get("/telegram");
      setBots(data);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  const setLoaderFor = (id, state) =>
    setActionLoading(prev => ({ ...prev, [id]: state }));

  const handleConnect = async bot => {
    setLoaderFor(bot.id, true);
    try {
      await api.post(`/telegram/${bot.id}/connect`);
      toast.success(`${bot.name} conectado`);
      fetchBots();
    } catch (err) {
      toastError(err);
    } finally {
      setLoaderFor(bot.id, false);
    }
  };

  const handleDisconnect = bot => {
    setConfirmModal({
      open: true,
      title: "Desconectar bot",
      message: `¿Desconectar el bot "${bot.name}"?`,
      onConfirm: async () => {
        setLoaderFor(bot.id, true);
        try {
          await api.post(`/telegram/${bot.id}/disconnect`);
          toast.success(`${bot.name} desconectado`);
          fetchBots();
        } catch (err) {
          toastError(err);
        } finally {
          setLoaderFor(bot.id, false);
        }
      },
    });
  };

  const handleDelete = bot => {
    setConfirmModal({
      open: true,
      title: "Eliminar bot",
      message: `¿Eliminar el bot "${bot.name}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await api.delete(`/telegram/${bot.id}`);
          toast.success("Bot eliminado");
          fetchBots();
        } catch (err) {
          toastError(err);
        }
      },
    });
  };

  const handleEdit = bot => {
    setEditingId(bot.id);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditingId(null);
    setModalOpen(true);
  };

  const statusChip = status => {
    if (status === "connected")
      return <Chip size="small" label="Conectado" className={classes.statusConnected} />;
    if (status === "error")
      return <Chip size="small" label="Error" className={classes.statusError} />;
    return <Chip size="small" label="Desconectado" className={classes.statusDisconnected} />;
  };

  return (
    <MainContainer>
      {/* Confirmation modal */}
      <ConfirmationModal
        title={confirmModal.title}
        open={confirmModal.open}
        onClose={() => setConfirmModal(m => ({ ...m, open: false }))}
        onConfirm={() => {
          if (confirmModal.onConfirm) confirmModal.onConfirm();
          setConfirmModal(m => ({ ...m, open: false }));
        }}
      >
        {confirmModal.message}
      </ConfirmationModal>

      {/* Add/edit modal */}
      <TelegramModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        telegramId={editingId}
        onSaved={fetchBots}
      />

      <MainHeader>
        <Title>Telegram — Bots</Title>
        <MainHeaderButtonsWrapper>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Add />}
            onClick={handleAdd}
          >
            Agregar bot
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.mainPaper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell align="center">Estado</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : bots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <Typography variant="body2" color="textSecondary">
                    No hay bots configurados. Haz clic en "Agregar bot" para comenzar.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              bots.map(bot => (
                <TableRow key={bot.id}>
                  <TableCell>
                    <Typography variant="body2">{bot.name}</Typography>
                  </TableCell>
                  <TableCell align="center">{statusChip(bot.status)}</TableCell>
                  <TableCell align="center">
                    <div className={classes.actionButtons}>
                      {bot.status !== "connected" ? (
                        <Tooltip title="Conectar">
                          <span>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleConnect(bot)}
                              disabled={!!actionLoading[bot.id]}
                            >
                              {actionLoading[bot.id] ? (
                                <CircularProgress size={18} className={classes.buttonProgress} />
                              ) : (
                                <PowerSettingsNew />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Desconectar">
                          <span>
                            <IconButton
                              size="small"
                              color="secondary"
                              onClick={() => handleDisconnect(bot)}
                              disabled={!!actionLoading[bot.id]}
                            >
                              <Cancel />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => handleEdit(bot)}>
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => handleDelete(bot)}
                        >
                          <DeleteOutline />
                        </IconButton>
                      </Tooltip>
                    </div>
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

export default TelegramPage;
