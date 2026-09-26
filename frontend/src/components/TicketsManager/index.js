import React, { useContext, useEffect, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import SearchIcon from "@material-ui/icons/Search";
import InputBase from "@material-ui/core/InputBase";
import MoveToInboxOutlinedIcon from "@material-ui/icons/MoveToInboxOutlined";
import CheckCircleOutlineIcon from "@material-ui/icons/CheckCircleOutline";
import AccountTreeOutlinedIcon from "@material-ui/icons/AccountTreeOutlined";
import AddIcon from "@material-ui/icons/Add";
import FilterListIcon from "@material-ui/icons/FilterList";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Switch from "@material-ui/core/Switch";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import NewTicketModal from "../NewTicketModal";
import TicketsList from "../TicketsList";
import TabPanel from "../TabPanel";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import rules from "../../rules";
import TicketsQueueSelect from "../TicketsQueueSelect";
import { Button } from "@material-ui/core";

const useStyles = makeStyles((theme) => ({
  ticketsWrapper: {
    position: "relative",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.primary,
  },
  listHead: {
    flex: "none",
    backgroundColor: theme.palette.background.paper,
    padding: "14px 14px 12px",
    borderBottom: `1px solid ${theme.palette.type === "dark" ? "#2a3942" : "rgba(0,0,0,0.08)"}`,
  },
  pillTabsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pillTab: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "0.8rem",
    fontWeight: 600,
    padding: "7px 12px",
    borderRadius: 10,
    color: theme.palette.text.secondary,
    cursor: "pointer",
    userSelect: "none",
    border: `1px solid ${theme.palette.type === "dark" ? "#2a3942" : "rgba(0,0,0,0.1)"}`,
    background: theme.palette.background.paper,
  },
  pillTabActive: {
    background: theme.palette.type === "dark" ? theme.palette.primary.main : "#e9f1fd",
    borderColor: theme.palette.primary.main,
    color: theme.palette.type === "dark" ? "#ffffff" : theme.palette.primary.main,
  },
  pillCount: {
    background: "#1c2333",
    color: "#fff",
    fontSize: "0.68rem",
    fontWeight: 700,
    minWidth: 18,
    height: 18,
    padding: "0 5px",
    borderRadius: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  newBtn: {
    marginLeft: "auto",
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 700,
    boxShadow: "none",
  },
  ticketOptionsBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  queueSelect: {
    flex: 1,
    minWidth: 0,
  },
  filtersBtn: {
    flexShrink: 0,
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 600,
    color: theme.palette.text.secondary,
    borderColor: theme.palette.type === "dark" ? "#2a3942" : "rgba(0,0,0,0.15)",
  },
  serachInputWrapper: {
    background: theme.palette.type === "dark" ? "#2a3942" : "#f1f3f6",
    display: "flex",
    alignItems: "center",
    borderRadius: 12,
    padding: "2px 6px",
    marginBottom: 12,
  },
  searchIcon: {
    color: theme.palette.text.secondary,
    marginLeft: 6,
    marginRight: 6,
    alignSelf: "center",
  },
  searchInput: {
    flex: 1,
    border: "none",
    borderRadius: 10,
    color: theme.palette.text.primary,
    backgroundColor: "transparent",
  },
  badge: {
    right: "-10px",
  },
  show: {
    display: "block",
  },
  hide: {
    display: "none !important",
  },
}));

const TicketsManager = () => {
  const classes = useStyles();
  const [searchParam, setSearchParam] = useState("");
  const [tab, setTab] = useState("open");
  const [tabOpen, setTabOpen] = useState("open");
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const searchInputRef = useRef();
  const { user } = useContext(AuthContext);
  const [openCount, setOpenCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const userQueueIds = user.queues.map((q) => q.id);
  const [selectedQueueIds, setSelectedQueueIds] = useState(userQueueIds || []);
  const [filtersAnchorEl, setFiltersAnchorEl] = useState(null);
  const canShowAll = rules[user.profile]?.static?.includes(
    "tickets-manager:showall"
  );

  useEffect(() => {
    if (user.profile.toUpperCase() === "ADMIN") {
      setShowAllTickets(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let searchTimeout;

  const handleSearch = (e) => {
    const searchedTerm = e.target.value.toLowerCase();

    clearTimeout(searchTimeout);

    if (searchedTerm === "") {
      setSearchParam(searchedTerm);
      setTab("open");
      return;
    }

    searchTimeout = setTimeout(() => {
      setSearchParam(searchedTerm);
      setTab("search");
    }, 500);
  };

  const handleChangeTab = (e, newValue) => {
    setTab(newValue);
  };

  const handleChangeTabOpen = (e, newValue) => {
    setTabOpen(newValue);
  };

  const applyPanelStyle = (status) => {
    if (tabOpen !== status) {
      return { width: 0, height: 0 };
    }
  };

  return (
    <Paper elevation={0} variant="outlined" className={classes.ticketsWrapper}>
      <NewTicketModal
        modalOpen={newTicketModalOpen}
        onClose={(e) => setNewTicketModalOpen(false)}
      />
      <Paper elevation={0} square className={classes.listHead}>
        <div className={classes.serachInputWrapper}>
          <SearchIcon className={classes.searchIcon} />
          <InputBase
            className={classes.searchInput}
            inputRef={searchInputRef}
            placeholder={i18n.t("tickets.search.placeholder")}
            type="search"
            onChange={handleSearch}
          />
        </div>
        <div className={classes.pillTabsRow}>
          <button
            type="button"
            className={`${classes.pillTab} ${tab === "open" ? classes.pillTabActive : ""}`}
            onClick={(e) => handleChangeTab(e, "open")}
          >
            <MoveToInboxOutlinedIcon style={{ fontSize: 16 }} />
            {i18n.t("tickets.tabs.open.title")}
            {openCount + pendingCount > 0 && (
              <span className={classes.pillCount}>{openCount + pendingCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`${classes.pillTab} ${tab === "groups" ? classes.pillTabActive : ""}`}
            onClick={(e) => handleChangeTab(e, "groups")}
          >
            <AccountTreeOutlinedIcon style={{ fontSize: 16 }} />
            {i18n.t("tickets.tabs.groups.title")}
          </button>
          <button
            type="button"
            className={`${classes.pillTab} ${tab === "closed" ? classes.pillTabActive : ""}`}
            onClick={(e) => handleChangeTab(e, "closed")}
          >
            <CheckCircleOutlineIcon style={{ fontSize: 16 }} />
            {i18n.t("tickets.tabs.closed.title")}
          </button>
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<AddIcon />}
            className={classes.newBtn}
            onClick={() => setNewTicketModalOpen(true)}
          >
            {i18n.t("ticketsManager.buttons.newTicket")}
          </Button>
        </div>
        <div className={classes.ticketOptionsBox}>
          <TicketsQueueSelect
            className={classes.queueSelect}
            selectedQueueIds={selectedQueueIds}
            userQueues={user?.queues}
            onChange={(values) => setSelectedQueueIds(values)}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<FilterListIcon style={{ fontSize: 16 }} />}
            className={classes.filtersBtn}
            onClick={(e) => setFiltersAnchorEl(e.currentTarget)}
          >
            {i18n.t("tickets.buttons.moreFilters")}
          </Button>
          {canShowAll && (
            <Menu
              anchorEl={filtersAnchorEl}
              open={Boolean(filtersAnchorEl)}
              onClose={() => setFiltersAnchorEl(null)}
            >
              <MenuItem>
                <FormControlLabel
                  label={i18n.t("tickets.buttons.showAll")}
                  control={
                    <Switch
                      size="small"
                      checked={showAllTickets}
                      onChange={() =>
                        setShowAllTickets((prevState) => !prevState)
                      }
                      name="showAllTickets"
                      color="primary"
                    />
                  }
                />
              </MenuItem>
            </Menu>
          )}
        </div>
      </Paper>
      {/* ── ABIERTOS ───────────────────────────────────────── */}
      <TabPanel value={tab} name="open" className={classes.ticketsWrapper}>
        <div className={classes.pillTabsRow} style={{ padding: "8px 12px", borderBottom: "1px solid rgba(128,128,128,0.15)" }}>
          <button
            type="button"
            className={`${classes.pillTab} ${tabOpen === "open" ? classes.pillTabActive : ""}`}
            onClick={(e) => handleChangeTabOpen(e, "open")}
          >
            {i18n.t("ticketsList.assignedHeader")}
            {openCount > 0 && <span className={classes.pillCount}>{openCount}</span>}
          </button>
          <button
            type="button"
            className={`${classes.pillTab} ${tabOpen === "pending" ? classes.pillTabActive : ""}`}
            onClick={(e) => handleChangeTabOpen(e, "pending")}
          >
            {i18n.t("ticketsList.pendingHeader")}
            {pendingCount > 0 && (
              <span className={classes.pillCount} style={{ background: "#e5484d" }}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>
        <Paper className={classes.ticketsWrapper}>
          <TicketsList
            status="open"
            showAll={showAllTickets}
            selectedQueueIds={selectedQueueIds}
            isGroup={false}
            updateCount={(val) => setOpenCount(val)}
            style={applyPanelStyle("open")}
          />
          <TicketsList
            status="pending"
            selectedQueueIds={selectedQueueIds}
            isGroup={false}
            updateCount={(val) => setPendingCount(val)}
            style={applyPanelStyle("pending")}
          />
        </Paper>
      </TabPanel>

      {/* ── GRUPOS ─────────────────────────────────────────── */}
      <TabPanel value={tab} name="groups" className={classes.ticketsWrapper}>
        <TicketsList
          isGroup={true}
          showAll={showAllTickets}
          selectedQueueIds={selectedQueueIds}
        />
      </TabPanel>

      {/* ── RESUELTOS ──────────────────────────────────────── */}
      <TabPanel value={tab} name="closed" className={classes.ticketsWrapper}>
        <TicketsList
          status="closed"
          showAll={true}
          selectedQueueIds={selectedQueueIds}
          isGroup={false}
        />
      </TabPanel>

      {/* ── BUSCAR ─────────────────────────────────────────── */}
      <TabPanel value={tab} name="search" className={classes.ticketsWrapper}>
        <TicketsList
          searchParam={searchParam}
          showAll={true}
          selectedQueueIds={selectedQueueIds}
        />
      </TabPanel>
    </Paper>
  );
};

export default TicketsManager;
