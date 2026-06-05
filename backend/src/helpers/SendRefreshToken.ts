import { Response } from "express";

export const SendRefreshToken = (res: Response, token: string): void => {
  res.cookie("jrt", token, {
    httpOnly: true,
    path: "/",               // must be global so the cookie is sent on every /auth/* request
    sameSite: "lax",         // CSRF protection (lax allows same-site navigations)
    secure: process.env.NODE_ENV === "production", // HTTPS only in prod
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days — matches refreshExpiresIn
  });
};
