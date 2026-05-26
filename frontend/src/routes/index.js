import React from "react";
import { BrowserRouter, Switch, Redirect } from "react-router-dom";
import { ToastContainer } from "react-toastify";

import LoggedInLayout from "../layout";
import Dashboard from "../pages/Dashboard/";
import Tickets from "../pages/Tickets/";
import Login from "../pages/Login/";
import ForgotPassword from "../pages/ForgotPassword/";
import ResetPassword from "../pages/ResetPassword/";
import Connections from "../pages/Connections/";
import Settings from "../pages/Settings/";
import Users from "../pages/Users";
import Contacts from "../pages/Contacts/";
import QuickAnswers from "../pages/QuickAnswers/";
import Queues from "../pages/Queues/";
import Labels from "../pages/Labels/";
import { AuthProvider } from "../context/Auth/AuthContext";
import { WhatsAppsProvider } from "../context/WhatsApp/WhatsAppsContext";
import { ThemeProvider } from "../context/DarkMode";
import Route from "./Route";

const Routes = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Switch>
            <Route exact path="/login" component={Login} />
            {/* Signup deshabilitado — redirigir a login */}
            <Route exact path="/signup" render={() => <Redirect to="/login" />} />
            <Route exact path="/forgot-password" component={ForgotPassword} />
            <Route exact path="/reset-password/:token" component={ResetPassword} />
            <WhatsAppsProvider>
              <LoggedInLayout>
                <Route exact path="/" component={Dashboard} isPrivate />
                <Route exact path="/tickets/:ticketId?" component={Tickets} isPrivate />
                <Route exact path="/connections" component={Connections} isPrivate />
                <Route exact path="/contacts" component={Contacts} isPrivate />
                <Route exact path="/users" component={Users} isPrivate />
                <Route exact path="/quickAnswers" component={QuickAnswers} isPrivate />
                <Route exact path="/Settings" component={Settings} isPrivate />
                <Route exact path="/Queues" component={Queues} isPrivate />
                <Route exact path="/labels" component={Labels} isPrivate />
              </LoggedInLayout>
            </WhatsAppsProvider>
          </Switch>
          <ToastContainer autoClose={3000} />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default Routes;
