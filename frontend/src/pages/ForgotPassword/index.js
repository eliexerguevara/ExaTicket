import React, { useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import {
  Avatar,
  Button,
  CssBaseline,
  TextField,
  Grid,
  Box,
  Typography,
  Container,
  CircularProgress
} from "@material-ui/core";

import { LockOutlined } from "@material-ui/icons";
import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  paper: {
    marginTop: theme.spacing(8),
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  },
  avatar: {
    margin: theme.spacing(1),
    backgroundColor: theme.palette.secondary.main
  },
  form: {
    width: "100%",
    marginTop: theme.spacing(1)
  },
  submit: {
    margin: theme.spacing(3, 0, 2)
  },
  link: {
    marginTop: theme.spacing(1),
    display: "block",
    textAlign: "center"
  }
}));

const ForgotPassword = () => {
  const classes = useStyles();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
      toast.success(i18n.t("forgotPassword.toasts.success"));
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <CssBaseline />
      <div className={classes.paper}>
        <Avatar className={classes.avatar}>
          <LockOutlined />
        </Avatar>
        <Typography component="h1" variant="h5">
          {i18n.t("forgotPassword.title")}
        </Typography>

        {sent ? (
          <Box mt={3} textAlign="center">
            <Typography variant="body1" color="textSecondary">
              {i18n.t("forgotPassword.toasts.success")}
            </Typography>
          </Box>
        ) : (
          <form className={classes.form} onSubmit={handleSubmit} noValidate>
            <TextField
              variant="outlined"
              margin="normal"
              required
              fullWidth
              id="email"
              label={i18n.t("forgotPassword.form.email")}
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              className={classes.submit}
              disabled={loading}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                i18n.t("forgotPassword.buttons.submit")
              )}
            </Button>
          </form>
        )}

        <Grid container justifyContent="center">
          <Grid item>
            <RouterLink
              to="/login"
              style={{ color: "#1976d2", fontSize: 14 }}
            >
              {i18n.t("forgotPassword.buttons.backToLogin")}
            </RouterLink>
          </Grid>
        </Grid>
      </div>
      <Box mt={8} />
    </Container>
  );
};

export default ForgotPassword;
