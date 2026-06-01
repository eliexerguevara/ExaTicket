import React, { useState, useContext } from "react";
import { Link as RouterLink } from "react-router-dom";

import {
  Button,
  CssBaseline,
  TextField,
  Typography,
  InputAdornment,
  IconButton,
  Link
} from "@material-ui/core";

import { Visibility, VisibilityOff } from "@material-ui/icons";
import { makeStyles } from "@material-ui/core/styles";

import logo from "../../assets/logo.png";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles(() => ({
  // Full-page radial gradient background (blue → white, like the reference)
  root: {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(ellipse at center, #4faad4 0%, #a8d8ea 35%, #e8f4f8 65%, #ffffff 100%)",
  },

  // White centered card
  card: {
    background: "#ffffff",
    borderRadius: 16,
    padding: "48px 40px 36px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 8px 40px rgba(0, 0, 0, 0.10)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },

  // Logo + name row at top
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 36,
  },
  brandLogo: {
    width: 72,
    height: 72,
  },
  brandName: {
    fontSize: "1.9rem",
    fontWeight: 800,
    color: "#1a3a5c",
    letterSpacing: "0.01em",
    lineHeight: 1,
  },

  // Inputs
  inputField: {
    width: "100%",
    marginBottom: 16,
    "& .MuiOutlinedInput-root": {
      borderRadius: 8,
      background: "#ffffff",
      "& fieldset": {
        borderColor: "#d1d5db",
      },
      "&:hover fieldset": {
        borderColor: "#2B6CB0",
      },
      "&.Mui-focused fieldset": {
        borderColor: "#2B6CB0",
        borderWidth: 2,
      },
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "#2B6CB0",
    },
  },

  // Submit button — solid blue matching brand
  submitBtn: {
    width: "100%",
    height: 48,
    borderRadius: 8,
    fontWeight: 700,
    fontSize: "0.95rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginTop: 8,
    background: "#2B6CB0",
    color: "#ffffff",
    boxShadow: "none",
    "&:hover": {
      background: "#1e4f8f",
      boxShadow: "none",
    },
  },

  // Forgot password link
  forgotLink: {
    display: "block",
    textAlign: "center",
    marginTop: 20,
    color: "#2B6CB0",
    fontSize: "0.875rem",
    fontWeight: 500,
  },
}));

const Login = () => {
  const classes = useStyles();
  const [user, setUser] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const { handleLogin } = useContext(AuthContext);

  const handleChangeInput = (e) =>
    setUser({ ...user, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    handleLogin(user);
  };

  return (
    <div className={classes.root}>
      <CssBaseline />
      <div className={classes.card}>

        {/* Logo + ExaTicket name */}
        <div className={classes.brandRow}>
          <img src={logo} alt="ExaTicket" className={classes.brandLogo} />
          <Typography component="span" className={classes.brandName}>
            ExaTicket
          </Typography>
        </div>

        {/* Form */}
        <form noValidate onSubmit={handleSubmit} style={{ width: "100%" }}>
          <TextField
            className={classes.inputField}
            variant="outlined"
            fullWidth
            id="email"
            label={i18n.t("login.form.email")}
            name="email"
            value={user.email}
            onChange={handleChangeInput}
            autoComplete="email"
            autoFocus
          />
          <TextField
            className={classes.inputField}
            variant="outlined"
            fullWidth
            name="password"
            label={i18n.t("login.form.password")}
            id="password"
            value={user.password}
            onChange={handleChangeInput}
            autoComplete="current-password"
            type={showPassword ? "text" : "password"}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={() => setShowPassword((v) => !v)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            className={classes.submitBtn}
            disableElevation
          >
            {i18n.t("login.buttons.submit")}
          </Button>
        </form>

        <Link
          className={classes.forgotLink}
          component={RouterLink}
          to="/forgot-password"
          variant="body2"
        >
          {i18n.t("login.buttons.forgotPassword")}
        </Link>
      </div>
    </div>
  );
};

export default Login;
