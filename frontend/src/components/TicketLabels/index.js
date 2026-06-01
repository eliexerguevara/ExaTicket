import React, { useState, useEffect } from "react";
import {
  makeStyles,
  Chip,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Typography,
  CircularProgress,
} from "@material-ui/core";
import LabelIcon from "@material-ui/icons/Label";
import AddIcon from "@material-ui/icons/Add";
import CancelIcon from "@material-ui/icons/Cancel";
import CloseIcon from "@material-ui/icons/Close";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px 4px 12px",
    borderTop: `1px solid ${theme.palette.divider}`,
    minHeight: 36,
    backgroundColor: theme.palette.background.paper,
  },
  title: {
    fontSize: "0.75em",
    color: theme.palette.text.secondary,
    fontWeight: 600,
    textTransform: "uppercase",
    marginRight: 4,
    display: "flex",
    alignItems: "center",
    gap: 3,
  },
  chip: {
    height: 22,
    fontSize: "0.72em",
    fontWeight: 600,
    color: "#fff",
    borderRadius: 8,
    "& .MuiChip-deleteIcon": {
      color: "rgba(255,255,255,0.8)",
      width: 14,
      height: 14,
      "&:hover": { color: "#fff" },
    },
  },
  addBtn: {
    padding: 2,
    width: 22,
    height: 22,
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    display: "inline-block",
    flexShrink: 0,
  },
}));

const TicketLabels = ({ ticket, onUpdate }) => {
  const classes = useStyles();
  const [allLabels, setAllLabels] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);

  // ticket.labels comes from ShowTicketService
  const ticketLabels = ticket?.labels || [];
  const appliedIds = new Set(ticketLabels.map(l => l.id));

  useEffect(() => {
    api.get("/labels").then(({ data }) => setAllLabels(data)).catch(() => {});
  }, []);

  const handleAdd = async labelId => {
    setAnchorEl(null);
    setLoading(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/labels/${labelId}`);
      // Use the response directly — backend returns full ticket via ShowTicketService
      if (typeof onUpdate === "function") onUpdate(data);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async labelId => {
    setLoading(true);
    try {
      const { data } = await api.delete(`/tickets/${ticket.id}/labels/${labelId}`);
      // Use the response directly — backend returns full ticket via ShowTicketService
      if (typeof onUpdate === "function") onUpdate(data);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const available = allLabels.filter(l => !appliedIds.has(l.id));

  return (
    <div className={classes.root}>
      <span className={classes.title}>
        <LabelIcon style={{ fontSize: 13 }} />
        {i18n.t("ticketLabels.title")}:
      </span>

      {ticketLabels.map(label => (
        <Chip
          key={label.id}
          label={label.name}
          size="small"
          className={classes.chip}
          style={{ backgroundColor: label.color }}
          deleteIcon={<CloseIcon style={{ fontSize: 13, color: "rgba(255,255,255,0.9)" }} />}
          onDelete={() => handleRemove(label.id)}
        />
      ))}

      {loading && <CircularProgress size={14} />}

      {available.length > 0 && (
        <>
          <Tooltip title={i18n.t("ticketLabels.addLabel")}>
            <IconButton
              size="small"
              className={classes.addBtn}
              onClick={e => setAnchorEl(e.currentTarget)}
            >
              <AddIcon style={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            {available.map(label => (
              <MenuItem
                key={label.id}
                dense
                onClick={() => handleAdd(label.id)}
                className={classes.menuItem}
              >
                <span
                  className={classes.colorDot}
                  style={{ backgroundColor: label.color }}
                />
                <Typography variant="body2">{label.name}</Typography>
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </div>
  );
};

export default TicketLabels;
