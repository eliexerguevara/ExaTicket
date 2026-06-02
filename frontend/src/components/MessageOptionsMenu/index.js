import React, { useState, useContext } from "react";

import MenuItem from "@material-ui/core/MenuItem";
import {
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Divider,
} from "@material-ui/core";
import EditIcon from "@material-ui/icons/Edit";
import DeleteSweepIcon from "@material-ui/icons/DeleteSweep";
import DeleteForeverIcon from "@material-ui/icons/DeleteForever";
import ReplyIcon from "@material-ui/icons/Reply";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import ConfirmationModal from "../ConfirmationModal";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import toastError from "../../errors/toastError";

const MessageOptionsMenu = ({ message, menuOpen, handleClose, anchorEl }) => {
  const { setReplyingMessage } = useContext(ReplyMessageContext);

  // Delete state
  const [deleteScope, setDeleteScope] = useState(null); // "me" | "everyone"
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editBody, setEditBody] = useState("");

  // ── Delete handlers ────────────────────────────────────────────────────────

  const openDeleteConfirm = (scope) => {
    setDeleteScope(scope);
    setConfirmDeleteOpen(true);
    handleClose();
  };

  const handleDeleteMessage = async () => {
    try {
      await api.delete(`/messages/${message.id}?scope=${deleteScope}`);
    } catch (err) {
      toastError(err);
    }
  };

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const openEditDialog = () => {
    setEditBody(message.body || "");
    setEditOpen(true);
    handleClose();
  };

  const handleEditMessage = async () => {
    if (!editBody.trim()) return;
    try {
      await api.patch(`/messages/${message.id}`, { body: editBody.trim() });
      setEditOpen(false);
    } catch (err) {
      toastError(err);
    }
  };

  // ── Reply handler ──────────────────────────────────────────────────────────

  const handleReplyMessage = () => {
    setReplyingMessage(message);
    handleClose();
  };

  const isTextMessage = !message.mediaType || message.mediaType === "chat";
  const canEdit = message.fromMe && isTextMessage && !message.isDeleted;

  return (
    <>
      {/* ── Delete for me confirmation ─────────────────────────────────── */}
      <ConfirmationModal
        title={i18n.t("messageOptionsMenu.deleteForMe")}
        open={confirmDeleteOpen && deleteScope === "me"}
        onClose={setConfirmDeleteOpen}
        onConfirm={handleDeleteMessage}
      >
        {i18n.t("messageOptionsMenu.confirmationModal.deleteForMeMessage")}
      </ConfirmationModal>

      {/* ── Delete for everyone confirmation ──────────────────────────── */}
      <ConfirmationModal
        title={i18n.t("messageOptionsMenu.deleteForEveryone")}
        open={confirmDeleteOpen && deleteScope === "everyone"}
        onClose={setConfirmDeleteOpen}
        onConfirm={handleDeleteMessage}
      >
        {i18n.t("messageOptionsMenu.confirmationModal.deleteForEveryoneMessage")}
      </ConfirmationModal>

      {/* ── Edit dialog ───────────────────────────────────────────────── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{i18n.t("messageOptionsMenu.editDialog.title")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            multiline
            minRows={2}
            maxRows={6}
            fullWidth
            variant="outlined"
            label={i18n.t("messageOptionsMenu.editDialog.label")}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleEditMessage();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} color="default">
            {i18n.t("messageOptionsMenu.editDialog.cancel")}
          </Button>
          <Button onClick={handleEditMessage} color="primary" variant="contained">
            {i18n.t("messageOptionsMenu.editDialog.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Context menu ──────────────────────────────────────────────── */}
      <Menu
        anchorEl={anchorEl}
        getContentAnchorEl={null}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        open={menuOpen}
        onClose={handleClose}
      >
        {/* Reply — available for all messages */}
        <MenuItem onClick={handleReplyMessage}>
          <ReplyIcon fontSize="small" style={{ marginRight: 8 }} />
          {i18n.t("messageOptionsMenu.reply")}
        </MenuItem>

        {/* Edit — only own text messages */}
        {canEdit && (
          <MenuItem onClick={openEditDialog}>
            <EditIcon fontSize="small" style={{ marginRight: 8 }} />
            {i18n.t("messageOptionsMenu.edit")}
          </MenuItem>
        )}

        {/* Delete options — only own messages */}
        {message.fromMe && !message.isDeleted && (
          <Divider />
        )}
        {message.fromMe && !message.isDeleted && (
          <MenuItem onClick={() => openDeleteConfirm("me")}>
            <DeleteSweepIcon fontSize="small" style={{ marginRight: 8 }} />
            {i18n.t("messageOptionsMenu.deleteForMe")}
          </MenuItem>
        )}
        {message.fromMe && !message.isDeleted && (
          <MenuItem onClick={() => openDeleteConfirm("everyone")} style={{ color: "#d32f2f" }}>
            <DeleteForeverIcon fontSize="small" style={{ marginRight: 8, color: "#d32f2f" }} />
            {i18n.t("messageOptionsMenu.deleteForEveryone")}
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

export default MessageOptionsMenu;
