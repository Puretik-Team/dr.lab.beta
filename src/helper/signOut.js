import { apiCall } from "../libs/api";
import { send } from "../control/renderer";

// Signing out is a local action (clear the token, drop the session) and
// must always succeed — an expired token or unreachable server used to
// throw inside apiCall() and leave the user stuck logged in with no way
// back to the login screen. The server call is now best-effort only: we
// still tell the server so it can revoke the token, but a failure there
// (offline, expired token, timeout) never blocks the local sign-out.
export const signout = async (setSignoutLoading, setIsLogin, navigate) => {
  setSignoutLoading(true);
  try {
    await apiCall({
      pathname: `/app/logout`,
      method: "POST",
      auth: true,
      isFormData: false,
    });
  } catch (error) {
    console.log("Server logout failed (signing out locally anyway):", error);
  }

  try {
    send({ query: "setSyncConfig", data: { enabled: false } });
  } catch (error) {
    console.log("setSyncConfig on signout failed:", error);
  }

  localStorage.removeItem("lab_token");
  localStorage.removeItem("lab-user");
  setSignoutLoading(false);
  setIsLogin(false);
  navigate(-1, { replace: true });
};
