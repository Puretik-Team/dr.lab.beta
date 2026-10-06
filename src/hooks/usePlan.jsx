import dayjs from "dayjs";
import { apiCall, URL, isLegacyToken } from "../libs/api";
import { useAppStore } from "../libs/appStore";
import { message } from "antd";
import { create } from "zustand";
import useInitHeaderImage from "./useInitHeaderImage";
import { send, fireAndForget } from "../control/renderer";
import { syncCatalogUpdates } from "../screens/TemplatesScreen/api";
import { useEffect } from "react";

const usePlanState = create((set) => ({
  planType: null,
  printLimit: null,
  whatsappLimit: null,
  registerAt: null,
  subscriptionExpire: null,
  setPlanType: (planType) => set({ planType }),
  setPrintLimit: (printLimit) => set({ printLimit }),
  setWhatsappLimit: (whatsappLimit) => set({ whatsappLimit }),
  setRegisterAt: (registerAt) => set({ registerAt }),
  setSubscriptionExpire: (subscriptionExpire) => set({ subscriptionExpire }),
}));

export const usePlan = () => {
  const {
    planType,
    printLimit,
    whatsappLimit,
    registerAt,
    subscriptionExpire,
    setPlanType,
    setPrintLimit,
    setWhatsappLimit,
    setSubscriptionExpire,
    setRegisterAt,
  } = usePlanState();
  const { setIsLogin } = useAppStore();
  const { fetchHeader } = useInitHeaderImage();

  const getUserData = async () => {
    try {
      const resp = await apiCall({
        method: "POST",
        pathname: "/app/user",
        isFormData: false,
        auth: true,
      });

      if (resp.ok) {
        const userData = await resp.json();
        const newTests = userData?.testGroups;

        // Parse testGroups if it's a JSON string
        let parsedTests = newTests;
        if (typeof newTests === "string") {
          try {
            parsedTests = JSON.parse(newTests);
          } catch (parseError) {
            console.error(
              "Failed to parse testGroups JSON string:",
              parseError
            );
            parsedTests = null;
          }
        }

        if (
          parsedTests &&
          Array.isArray(parsedTests) &&
          parsedTests.length > 0
        ) {
          // Stringify the data for SQLite storage since it contains nested objects
          const stringifiedData = parsedTests.map((testGroup) => ({
            ...testGroup,
            options:
              typeof testGroup.options === "string"
                ? testGroup.options
                : JSON.stringify(testGroup.options),
            groupTest:
              typeof testGroup.groupTest === "string"
                ? testGroup.groupTest
                : JSON.stringify(testGroup.groupTest),
          }));

          send({
            query: "addNewData",
            data: stringifiedData,
          });
        }
        return userData;
      } else if (resp.status === 404) {
        const jsonResp = await resp.json();
        message.error(jsonResp.error);
        localStorage.removeItem("lab-user");
        localStorage.removeItem("lab_token");
        setIsLogin(false);
      }
    } catch (error) {
      console.log(error);
      return null;
    }
  };

  const updateData = (userInfo) => {
    let { Plan, balance, whatsappMsgPrice, expiredAt, createdAt } =
      JSON.parse(userInfo) || {};
    setPlanType(Plan?.type);
    setPrintLimit(Plan?.printLimit);
    setSubscriptionExpire(expiredAt);
    setRegisterAt(createdAt);

    let msgLimit = balance / whatsappMsgPrice;
    setWhatsappLimit(msgLimit <= 0 ? 0 : msgLimit);
  };

  const forceLegacyLogout = async (userToken) => {
    try {
      await apiCall({ method: "POST", pathname: "/app/logout", auth: true });
    } catch (error) {
      console.log(error);
    } finally {
      localStorage.removeItem("lab_token");
      localStorage.removeItem("lab-user");
      setIsLogin(false);
    }
  };

  const initUser = async () => {
    let userInfo = localStorage.getItem("lab-user");
    let userToken = localStorage.getItem("lab_token");

    if (userToken && isLegacyToken(userToken)) {
      // Old Client-based session — force a fresh login through the new
      // User-based flow instead of continuing to use this stale token.
      await forceLegacyLogout(userToken);
      return;
    }

    if (userToken) {
      let resp = await getUserData();
      if (resp) {
        userInfo = JSON.stringify(resp);
        localStorage.setItem("lab-user", userInfo);
      }
      if (userInfo) updateData(userInfo);

      // Arm or disarm multi-PC sync in the main process based on the
      // account's server-side flag. Off (or missing) = app behaves exactly
      // as before sync existed.
      const parsedUser = JSON.parse(userInfo) || {};
      send({
        query: "setSyncConfig",
        data: {
          enabled: !!parsedUser.syncEnabled,
          token: userToken,
          apiUrl: URL,
        },
      });

      // Pull in newer versions of any report designs downloaded from the
      // template catalog (no-op when offline).
      syncCatalogUpdates();

      await fetchHeader(parsedUser);
    }
  };

  useEffect(() => {
    const onOnline = () => {
      fireAndForget({ query: "syncNow" });
      syncCatalogUpdates({ force: true });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const getWhatsappUsed = () => {
    let count = 0;
    let whatsappUsed = localStorage.getItem("whatsapp-used");
    if (whatsappUsed) count = parseInt(JSON.parse(whatsappUsed), 10) || 0;
    return count;
  };

  const setWhatsappUsed = async () => {
    let whatsappUsed = getWhatsappUsed();
    localStorage.setItem("whatsapp-used", whatsappUsed + 1);
  };

  const canSendWhatsapp = () => {
    let whatsappUsed = getWhatsappUsed();
    if (whatsappUsed >= whatsappLimit && planType !== "FREE") return false;
    return true;
  };

  const getPrintUsed = () => {
    const today = dayjs().startOf("day");
    const dateStoredRaw = localStorage.getItem("print-date");
    const dateStored = dateStoredRaw
      ? dayjs(dateStoredRaw).startOf("day")
      : null;

    let count = 0;

    if (today.isAfter(dateStored, "day")) {
      localStorage.setItem("print-date", today.toISOString());
      localStorage.setItem("print-used", 0);
      return 0;
    }

    let printUsed = localStorage.getItem("print-used");
    if (printUsed) count = parseInt(printUsed, 10) || 0;
    return count;
  };

  const setPrintUsed = () => {
    if (planType !== "FREE") return;
    let printUsed = getPrintUsed();
    localStorage.setItem("print-used", printUsed + 1);
  };

  const canPrint = () => {
    if (planType !== "FREE") return true;

    const printUsed = getPrintUsed();
    const today = dayjs().startOf("day");

    const dateStoredRaw = localStorage.getItem("print-date");
    const dateStored = dateStoredRaw
      ? dayjs(dateStoredRaw).startOf("day")
      : null;

    if (!dateStored || printUsed === 0) {
      localStorage.setItem("print-date", today.toISOString());
      return true;
    }

    if (dateStored && dateStored.isSame(today, "day")) {
      return printUsed < printLimit;
    }

    if (today.isAfter(dateStored, "day")) {
      localStorage.setItem("print-date", today.toISOString());
      localStorage.setItem("print-used", 0);
      return true;
    }

    return false;
  };

  return {
    planType,
    printLimit,
    whatsappLimit,
    subscriptionExpire,
    registerAt,
    getWhatsappUsed,
    setWhatsappUsed,
    setPrintUsed,
    getPrintUsed,
    canPrint,
    canSendWhatsapp,
    initUser,
  };
};
