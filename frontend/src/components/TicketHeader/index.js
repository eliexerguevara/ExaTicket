import React from "react";

import { Card, IconButton } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import TicketHeaderSkeleton from "../TicketHeaderSkeleton";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";
import { useHistory } from "react-router-dom";

const useStyles = makeStyles((theme) => ({
  ticketHeader: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.palette.background.paper,
    flex: "none",
    minHeight: 68,
    padding: "0 12px",
    borderBottom: `1px solid ${theme.palette.type === "dark" ? "#2a3942" : "rgba(0,0,0,0.08)"}`,
    boxShadow: "none",
    [theme.breakpoints.down("sm")]: {
      flexWrap: "wrap",
    },
  },
  backButton: {
    flexShrink: 0,
    color: theme.palette.text.secondary,
    [theme.breakpoints.up("sm")]: {
      display: "none",
    },
  },
}));

const TicketHeader = ({ loading, children }) => {
  const classes = useStyles();
  const history = useHistory();
  const handleBack = () => {
    history.push("/tickets");
  };

  return (
    <>
      {loading ? (
        <TicketHeaderSkeleton />
      ) : (
        <Card square className={classes.ticketHeader}>
          <IconButton className={classes.backButton} onClick={handleBack}>
            <ArrowBackIcon />
          </IconButton>
          {children}
        </Card>
      )}
    </>
  );
};

export default TicketHeader;
