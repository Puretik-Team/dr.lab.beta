import React, { Suspense, lazy, useEffect } from "react";
import { ConfigProvider, Spin, theme } from "antd";
import { Routes, Route } from "react-router-dom";
import MainContainerV2 from "./components/ContainerV2";
const PatientsScreen = lazy(() => import("./screens/PatientsScreen"));
const TestsScreen = lazy(() => import("./screens/TestsScreen"));
const GroupsScreen = lazy(() => import("./screens/GroupsScreen"));
const HomeScreen = lazy(() => import("./screens/HomeScreen"));
const ReportsScreen = lazy(() => import("./screens/ReportsScreen"));
import LoginScreen from "./screens/LoginScreen";
const SettingsScreen = lazy(() => import("./screens/SettingScreen"));
import TitleBar from "./components/TitleBar/titleBar";
import useLogin from "./hooks/useLogin";
import { useAppStore } from "./libs/appStore";
// import useInitHeaderImage from "./hooks/useInitHeaderImage";
import OTPScreen from "./screens/OTPScreen/Index";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "./hooks/useAppThem";
const DoctorsScreen = lazy(() => import("./screens/DoctorsScreen"));
import { usePlan } from "./hooks/usePlan";
const VisitsScreen = lazy(() => import("./screens/VisitsScreen"));
const TemplatesScreen = lazy(() => import("./screens/TemplatesScreen"));
const { darkAlgorithm, defaultAlgorithm } = theme;

const { ipcRenderer } = window.require("electron");

function App() {
  const { isLogin, setIsOnline } = useAppStore();
  const { appTheme, appColors } = useAppTheme();
  const { initUser } = usePlan();
  const { i18n } = useTranslation();

  useLogin();

  useEffect(() => {
    // ipcRenderer.on("hello", () => {
    //   console.log("HEEELLLL");
    // });
    ipcRenderer.on("update-available", () => {
      console.log("update-available");
    });
    ipcRenderer.on("update-downloaded", () => {
      console.log("update-downloaded");
    });
    ipcRenderer.on("update-err", (err) => {
      console.log("update-err ", err);
    });

    // Handle online and offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const online = window.addEventListener("online", handleOnline);
    const offline = window.addEventListener("offline", handleOffline);

    return () => {
      online, offline;
    };
  }, []);

  useEffect(() => {
    // Only re-run on login state changes — this arms sync + fetches the
    // header image, neither of which needs to redo on every navigation.
    // `location` used to be a dependency here too, which re-armed (and so
    // reset) the sync engine's schedule timer on every screen change,
    // starving it of the quiet period it needs to ever run a cycle.
    if (isLogin) initUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogin]);

  return (
    <ConfigProvider
      key={appTheme}
      direction={i18n.language === "en" ? "ltr" : "rtl"}
      theme={{
        algorithm: appTheme === "dark" ? darkAlgorithm : defaultAlgorithm,
        token: {
          colorPrimary: appColors?.colorPrimary,
          colorError: appColors?.colorError,
          colorLink: appColors?.colorLink,
          borderRadius: 8,
        },
      }}
    >
      <TitleBar />
      {!isLogin && !localStorage.getItem("verification_phone") && (
        <LoginScreen />
      )}
      {!isLogin && localStorage.getItem("verification_phone") && <OTPScreen />}
      {isLogin && (
        <MainContainerV2>
          {/* Screens load on first visit instead of all at startup. */}
          <Suspense fallback={<Spin size="large" className="block mx-auto mt-24" />}>
          <Routes>
            <Route exact path="/" element={<HomeScreen />} />
            <Route exact path="/visits" element={<VisitsScreen />} />
            <Route path="/patients" element={<PatientsScreen />} />
            <Route path="/tests" element={<TestsScreen />} />
            <Route path="/groups" element={<GroupsScreen />} />
            <Route path="/reports" element={<ReportsScreen />} />
            <Route path="/templates/*" element={<TemplatesScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/doctors" element={<DoctorsScreen />} />
          </Routes>
          </Suspense>
        </MainContainerV2>
      )}
    </ConfigProvider>
  );
}

export default App;
