import React, { useState, useContext, useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";

import {
  Button,
  CssBaseline,
  TextField,
  Typography,
  InputAdornment,
  IconButton,
  Link,
  Box,
} from "@material-ui/core";

import { Visibility, VisibilityOff, Refresh } from "@material-ui/icons";
import { makeStyles } from "@material-ui/core/styles";

import logo from "../../assets/logo.png";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

// ─── CAPTCHA helpers ──────────────────────────────────────────────────────────

const CAPTCHA_THRESHOLD = 3;

const generateCaptcha = () => {
  const useSubtraction = Math.random() > 0.5;
  let a = Math.floor(Math.random() * 9) + 2;
  let b = Math.floor(Math.random() * 8) + 1;
  if (useSubtraction && a > b) {
    return { question: `${a} - ${b}`, answer: a - b };
  }
  return { question: `${a} + ${b}`, answer: a + b };
};

// Noise lines for the SVG CAPTCHA background
const buildNoise = (seed) => {
  const rng = (n) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  return Array.from({ length: 6 }, (_, i) => ({
    x1: Math.floor(rng(i * 4) * 220),
    y1: Math.floor(rng(i * 4 + 1) * 64),
    x2: Math.floor(rng(i * 4 + 2) * 220),
    y2: Math.floor(rng(i * 4 + 3) * 64),
  }));
};

const CaptchaSVG = ({ challenge, seed }) => {
  const text = `${challenge.question} = ?`;
  const noise = buildNoise(seed);
  const charOffsets = text.split("").map((_, i) => {
    const rng = ((seed * (i + 1) * 7919) % 100) / 100;
    return Math.floor(rng * 8) - 4;
  });

  return (
    <svg
      width="220"
      height="64"
      style={{ display: "block", userSelect: "none", pointerEvents: "none" }}
      aria-label="captcha"
    >
      <rect width="220" height="64" fill="#f0f4f8" rx="6" />
      {noise.map((l, i) => (
        <line
          key={i}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="#94a3b8" strokeWidth="1.2" opacity="0.45"
        />
      ))}
      {text.split("").map((ch, i) => (
        <text
          key={i}
          x={14 + i * 15}
          y={40 + charOffsets[i]}
          fontSize="22"
          fontWeight="800"
          fontFamily="'Courier New', monospace"
          fill={i % 2 === 0 ? "#1e3a5f" : "#2B6CB0"}
          style={{ letterSpacing: 0 }}
        >
          {ch}
        </text>
      ))}
    </svg>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles(() => ({
  root: {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "radial-gradient(ellipse at center, #4faad4 0%, #a8d8ea 35%, #e8f4f8 65%, #ffffff 100%)",
  },
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
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 36,
  },
  brandLogo: { width: 72, height: 72 },
  brandName: {
    fontSize: "1.9rem",
    fontWeight: 800,
    color: "#1a3a5c",
    letterSpacing: "0.01em",
    lineHeight: 1,
  },
  inputField: {
    width: "100%",
    marginBottom: 16,
    "& .MuiOutlinedInput-root": {
      borderRadius: 8,
      background: "#ffffff",
      "& fieldset": { borderColor: "#d1d5db" },
      "&:hover fieldset": { borderColor: "#2B6CB0" },
      "&.Mui-focused fieldset": { borderColor: "#2B6CB0", borderWidth: 2 },
    },
    "& .MuiInputLabel-root.Mui-focused": { color: "#2B6CB0" },
  },
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
    "&:hover": { background: "#1e4f8f", boxShadow: "none" },
  },
  forgotLink: {
    display: "block",
    textAlign: "center",
    marginTop: 20,
    color: "#2B6CB0",
    fontSize: "0.875rem",
    fontWeight: 500,
  },
  captchaBox: {
    width: "100%",
    marginBottom: 12,
    padding: "14px 16px",
    borderRadius: 8,
    border: "1.5px solid #e2e8f0",
    background: "#f8fafc",
  },
  captchaLabel: {
    fontSize: "0.78rem",
    color: "#64748b",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    marginBottom: 8,
  },
  captchaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  captchaRefresh: {
    color: "#2B6CB0",
    padding: 4,
  },
  captchaError: {
    fontSize: "0.75rem",
    color: "#dc2626",
    marginTop: -4,
    marginBottom: 6,
  },
}));

// ─── Component ────────────────────────────────────────────────────────────────

const Login = () => {
  const classes = useStyles();
  const { handleLogin } = useContext(AuthContext);

  const [user, setUser] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [challenge, setChallenge] = useState(() => generateCaptcha());
  const [captchaSeed, setCaptchaSeed] = useState(() => Math.floor(Math.random() * 9999));
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaError, setCaptchaError] = useState(false);

  const showCaptcha = failedAttempts >= CAPTCHA_THRESHOLD;

  const refreshCaptcha = useCallback(() => {
    setChallenge(generateCaptcha());
    setCaptchaSeed(Math.floor(Math.random() * 9999));
    setCaptchaInput("");
    setCaptchaError(false);
  }, []);

  const handleChangeInput = (e) =>
    setUser((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (showCaptcha) {
      const parsed = parseInt(captchaInput.trim(), 10);
      if (isNaN(parsed) || parsed !== challenge.answer) {
        setCaptchaError(true);
        refreshCaptcha();
        return;
      }
    }

    try {
      await handleLogin(user);
      setFailedAttempts(0);
      setCaptchaInput("");
      setCaptchaError(false);
    } catch {
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      if (next >= CAPTCHA_THRESHOLD) refreshCaptcha();
    }
  };

  return (
    <div className={classes.root}>
      <CssBaseline />
      <div className={classes.card}>

        {/* Brand */}
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

          {/* CAPTCHA — shown after 3 failed attempts */}
          {showCaptcha && (
            <Box className={classes.captchaBox}>
              <Typography className={classes.captchaLabel}>
                Verificación de seguridad
              </Typography>
              <Box className={classes.captchaRow}>
                <CaptchaSVG challenge={challenge} seed={captchaSeed} />
                <IconButton
                  className={classes.captchaRefresh}
                  onClick={refreshCaptcha}
                  size="small"
                  title="Generar nuevo captcha"
                >
                  <Refresh fontSize="small" />
                </IconButton>
              </Box>
              {captchaError && (
                <Typography className={classes.captchaError}>
                  Respuesta incorrecta. Intenta con el nuevo código.
                </Typography>
              )}
              <TextField
                variant="outlined"
                size="small"
                fullWidth
                label="Resultado"
                value={captchaInput}
                onChange={(e) => {
                  setCaptchaInput(e.target.value);
                  setCaptchaError(false);
                }}
                inputProps={{ maxLength: 4, inputMode: "numeric" }}
                error={captchaError}
                style={{ background: "#ffffff", borderRadius: 6 }}
              />
            </Box>
          )}

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
