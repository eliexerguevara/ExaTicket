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

import logo from "../../assets/logo.svg";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
  },

  // ── Left branding panel ────────────────────────────────────────────────────
  leftPanel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "45%",
    background: "linear-gradient(160deg, #0f2744 0%, #1a4380 45%, #2B6CB0 100%)",
    padding: theme.spacing(6),
    position: "relative",
    overflow: "hidden",
    [theme.breakpoints.down("sm")]: {
      display: "none",
    },
  },

  // decorative circle top-right
  decCircle1: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.06)",
  },
  // decorative circle bottom-left
  decCircle2: {
    position: "absolute",
    bottom: -100,
    left: -60,
    width: 320,
    height: 320,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.05)",
  },
  // small ring center-right
  decCircle3: {
    position: "absolute",
    top: "55%",
    right: -40,
    width: 160,
    height: 160,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.08)",
  },

  brandBlock: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    zIndex: 1,
    marginBottom: theme.spacing(5),
  },
  brandLogo: {
    width: 68,
    height: 68,
    filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
  },
  brandName: {
    fontSize: "2.6rem",
    fontWeight: 800,
    color: "#ffffff",
    letterSpacing: "0.01em",
    lineHeight: 1,
  },

  tagline: {
    zIndex: 1,
    color: "rgba(255,255,255,0.70)",
    fontSize: "1.05rem",
    textAlign: "center",
    maxWidth: 310,
    lineHeight: 1.6,
  },

  featureList: {
    zIndex: 1,
    marginTop: theme.spacing(5),
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1.5),
  },
  featureItem: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.2),
    color: "rgba(255,255,255,0.80)",
    fontSize: "0.9rem",
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#60a5fa",
    flexShrink: 0,
  },

  // ── Right form panel ───────────────────────────────────────────────────────
  rightPanel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    background: "#f0f4f8",
    padding: theme.spacing(4, 3),
    overflowY: "auto",
  },

  formCard: {
    background: "#ffffff",
    borderRadius: 16,
    boxShadow: "0 4px 32px rgba(0,0,0,0.09)",
    padding: theme.spacing(5, 4.5),
    width: "100%",
    maxWidth: 420,
  },

  // mobile-only brand (hidden on desktop)
  mobileBrand: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    justifyContent: "center",
    marginBottom: theme.spacing(3),
    [theme.breakpoints.up("md")]: {
      display: "none",
    },
  },
  mobileLogo: {
    width: 40,
    height: 40,
  },
  mobileName: {
    fontSize: "1.6rem",
    fontWeight: 800,
    color: "#2B6CB0",
  },

  formTitle: {
    fontWeight: 700,
    fontSize: "1.5rem",
    color: "#0f172a",
    marginBottom: theme.spacing(0.5),
  },
  formSubtitle: {
    color: "#64748b",
    fontSize: "0.9rem",
    marginBottom: theme.spacing(3.5),
  },

  inputField: {
    marginBottom: theme.spacing(2),
    "& .MuiOutlinedInput-root": {
      borderRadius: 10,
      background: "#f8fafc",
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: "#2B6CB0",
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "#2B6CB0",
        borderWidth: 2,
      },
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "#2B6CB0",
    },
  },

  submitBtn: {
    marginTop: theme.spacing(1),
    height: 50,
    borderRadius: 10,
    fontWeight: 700,
    fontSize: "1rem",
    textTransform: "none",
    background: "linear-gradient(135deg, #1a4380 0%, #2B6CB0 100%)",
    boxShadow: "0 4px 14px rgba(43,108,176,0.4)",
    "&:hover": {
      background: "linear-gradient(135deg, #153560 0%, #1e5799 100%)",
      boxShadow: "0 6px 18px rgba(43,108,176,0.5)",
    },
  },

  forgotLink: {
    display: "block",
    textAlign: "center",
    marginTop: theme.spacing(2.5),
    color: "#2B6CB0",
    fontSize: "0.875rem",
    fontWeight: 500,
    "&:hover": {
      color: "#1a4380",
    },
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

      {/* ── Left branding panel ── */}
      <div className={classes.leftPanel}>
        <span className={classes.decCircle1} />
        <span className={classes.decCircle2} />
        <span className={classes.decCircle3} />

        <div className={classes.brandBlock}>
          <img src={logo} alt="ExaTicket" className={classes.brandLogo} />
          <span className={classes.brandName}>ExaTicket</span>
        </div>

        <Typography className={classes.tagline}>
          Plataforma de soporte técnico omnicanal para empresas de telecomunicaciones.
        </Typography>

        <div className={classes.featureList}>
          {[
            "Soporte WhatsApp & Telegram con IA",
            "Integración Splynx y Zabbix",
            "Gestión de colas y etiquetas",
            "Reportes y métricas en tiempo real",
          ].map((feat) => (
            <div key={feat} className={classes.featureItem}>
              <span className={classes.featureDot} />
              {feat}
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className={classes.rightPanel}>
        <div className={classes.formCard}>

          {/* Mobile brand (hidden on desktop) */}
          <div className={classes.mobileBrand}>
            <img src={logo} alt="ExaTicket" className={classes.mobileLogo} />
            <span className={classes.mobileName}>ExaTicket</span>
          </div>

          <Typography className={classes.formTitle}>
            Bienvenido de nuevo
          </Typography>
          <Typography className={classes.formSubtitle}>
            Ingresa tus credenciales para continuar
          </Typography>

          <form noValidate onSubmit={handleSubmit}>
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
              color="primary"
              className={classes.submitBtn}
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
    </div>
  );
};

export default Login;
