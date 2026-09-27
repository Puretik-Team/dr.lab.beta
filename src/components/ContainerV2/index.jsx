import "./style.css";
import { useState } from "react";
import { HiOutlineHome } from "react-icons/hi2";
import { MdOutlinePersonalInjury } from "react-icons/md";
import { LiaUserNurseSolid } from "react-icons/lia";
import { FiFileText } from "react-icons/fi";

import {
  Alert,
  message,
  Layout,
  Menu,
  theme,
  Popconfirm,
  Popover,
  Modal,
  Button,
  Space,
} from "antd";
import { TbReportSearch } from "react-icons/tb";
import { GrDocumentTest } from "react-icons/gr";
import { LuPackage2, LuSettings2, LuLayoutTemplate } from "react-icons/lu";
import { IoMdLogOut } from "react-icons/io";
import { RxDoubleArrowRight } from "react-icons/rx";
import { motion } from "framer-motion";
import { useAppStore } from "../../libs/appStore";
import { useTranslation } from "react-i18next";
import darkLogo from "../../assets/dark-logo.png";
import lightLogo from "../../assets/light-logo.png";
import darkLogoName from "../../assets/dark-name.png";
import lightLogoName from "../../assets/light-name.png";
import { useNavigate, useLocation } from "react-router-dom";
import PopOverContent from "../../screens/SettingScreen/PopOverContent";
import { usePlan } from "../../hooks/usePlan";
import dayjs from "dayjs";
import {
  CrownFilled,
  MoonFilled,
  SunFilled,
  WarningFilled,
} from "@ant-design/icons";
import { signout } from "../../helper/signOut";
import { useAppTheme } from "../../hooks/useAppThem";

const { Sider, Content } = Layout;

const MainContainerV2 = ({ children }) => {
  const [collapsed, setCollapsed] = useState(true);
  const [signoutLoading, setSignoutLoading] = useState(false);
  const [isPopoverVisible, setIsPopoverVisible] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation(); // Use useTranslation to get the current language
  const { setIsLogin } = useAppStore();
  const { subscriptionExpire, planType } = usePlan();
  const { appTheme, appColors, changeAppTheme } = useAppTheme();

  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const showPopover = () => {
    setIsPopoverVisible(true);
  };

  // Function to determine rotation based on language
  const getRotationStyle = () => {
    if (i18n.language === "ar" || i18n.language === "ku") {
      // Arabic language: rotate -90 degrees if collapsed
      return collapsed ? "rotate(-180deg)" : "rotate(0deg)";
    } else {
      // Other languages: default rotation
      return collapsed ? "rotate(0deg)" : "rotate(180deg)";
    }
  };
  const getRotationStyle2 = () => {
    if (i18n.language === "ar" || i18n.language === "ku") {
      // Arabic language: rotate -90 degrees if collapsed
      return "rotate(0deg)";
    } else {
      // Other languages: default rotation
      return "rotate(180deg)";
    }
  };

  const isSubscriptionWarning = () => {
    if (planType === "SUBSCRIPTION" && !subscriptionExpire) return true;
    if (
      planType === "SUBSCRIPTION" &&
      dayjs(subscriptionExpire).isBefore(dayjs())
    )
      return true;
    else return false;
  };

  const handleSignout = async () => {
    setSignoutLoading(true);
    try {
      await signout(setSignoutLoading, setIsLogin, navigate);
    } catch (error) {
      console.error("Error during signout:", error);
      message.error(t("SignoutError"));
    } finally {
      setSignoutLoading(false);
    }
  };

  const renderLogo = () => {
    if (appTheme === "dark" && collapsed) {
      return <img className="w-[42px]" src={darkLogo} />;
    } else if (appTheme === "light" && collapsed) {
      return <img className="w-[42px]" src={lightLogo} />;
    } else if (appTheme === "dark" && !collapsed) {
      return (
        <Space align="center" size={6}>
          <img className="w-[42px]" src={darkLogo} />
          <img className="w-[68px] mt-[8px]" src={darkLogoName} />
        </Space>
      );
    } else if (appTheme === "light" && !collapsed) {
      return (
        <Space align="center" size={6}>
          <img className="w-[42px]" src={lightLogo} />
          <img className="w-[68px] mt-[8px]" src={lightLogoName} />
        </Space>
      );
    }
  };

  return (
    <Layout className="h-screen">
      <Sider
        style={{ background: appColors?.sideMenuBg, position: "relative", zIndex: 10 }}
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={164}
      >
        <div
          className="flex flex-col justify-between"
          style={{
            height: "calc(100% - 40px)",
          }}
        >
          <div>
            <div className="mt-[30px] font-bold text-[18px] flex justify-center mb-[30px]">
              <motion.div
                key={collapsed}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                {renderLogo()}
              </motion.div>
            </div>
            <Menu
              style={{
                border: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
              }}
              className="bg-transparent p-[8px]"
              mode="inline"
              defaultSelectedKeys={[location?.pathname]}
              items={[
                {
                  key: "/",
                  icon: <HiOutlineHome size={20} />,
                  label: <p className="text-[15px]">{t("Home")}</p>,
                  onClick: () => navigate("/", { replace: true }),
                },
                {
                  key: "/visits",
                  icon: <FiFileText size={18} />,
                  label: <p className="text-[15px]">{t("Visits")}</p>,
                  onClick: () => navigate("/visits", { replace: true }),
                },
                {
                  key: "/patients",
                  icon: <MdOutlinePersonalInjury size={20} />,
                  label: <p className="text-[15px]">{t("Patients")}</p>,
                  onClick: () => navigate("/patients", { replace: true }),
                },
                {
                  key: "/doctors",
                  icon: <LiaUserNurseSolid size={20} />,
                  label: <p className="text-[15px]">{t("Doctors")}</p>,
                  onClick: () => navigate("/doctors", { replace: true }),
                },
                {
                  key: "/tests",
                  icon: (
                    <GrDocumentTest size={16} style={{ marginRight: "2px" }} />
                  ),
                  label: <p className="text-[15px]">{t("Tests")}</p>,
                  onClick: () => navigate("/tests", { replace: true }),
                },
                // {
                //   key: "/package",
                //   icon: <LuPackage2 size={18} />,
                //   label: <p className="text-[15px]">{t("Package")}</p>,
                //   onClick: () => navigate("/groups", { replace: true }),
                // },
                {
                  key: "/reports",
                  icon: <TbReportSearch size={18} />,
                  disabled: planType === "FREE",
                  label:
                    planType === "FREE" ? (
                      <p className="text-[15px]">
                        {t("Reports")}
                        <CrownFilled className="!text-[14px] text-[#faad14]" />
                      </p>
                    ) : (
                      t("Reports")
                    ),
                  onClick: () => navigate("/reports", { replace: true }),
                },
                {
                  key: "/templates",
                  icon: <LuLayoutTemplate size={18} />,
                  label: <p className="text-[15px]">{t("ReportTemplates")}</p>,
                  onClick: () => navigate("/templates", { replace: true }),
                },
                {
                  key: "/settings",
                  icon: <LuSettings2 size={19} />,
                  label: <p className="text-[15px]">{t("Settings")}</p>,
                  onClick: () => navigate("/settings", { replace: true }),
                },
              ]}
            />
          </div>
          <div className="w-full grid">
            <Popconfirm
              onConfirm={handleSignout}
              title={t("SignoutConfirm")}
              description={t("SignOutFormThisApp")}
            >
              <button
                onClick={() => signoutLoading}
                className={`h-[48px] flex items-center gap-2 justify-center text-[22px] transition-all active:opacity-40 text-[#eb2f96]`}
                // style={{ borderColor: appColors.colorBorder }}
              >
                <IoMdLogOut
                  style={{
                    transform: getRotationStyle2(),
                  }}
                />
                {!collapsed && <p className="text-[15px]">{t("SignOut")}</p>}
              </button>
            </Popconfirm>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="h-[48px] flex items-center justify-center text-[22px] transition-all active:opacity-40"
              //style={{ borderColor: appColors.colorBorder }}
            >
              <RxDoubleArrowRight
                className="transition-all"
                style={{
                  transform: getRotationStyle(),
                  color: appColors.colorText,
                }}
              />
            </button>
            <button
              onClick={changeAppTheme}
              className={`h-[64px] flex items-center justify-center text-[22px] transition-all active:opacity-4 mb-4`}
              //style={{ borderColor: appColors.colorBorder }}
            >
              {appTheme === "light" ? (
                <MoonFilled className="transition-all text-[#303030]" />
              ) : (
                <SunFilled className="transition-all text-[#fff]" />
              )}
            </button>
          </div>
        </div>
      </Sider>

      <Content
        style={{
          background: colorBgContainer,
          borderRadius: 0,
          overflow: "auto",
          width: "100%",
        }}
      >
        {planType === "SUBSCRIPTION" &&
          !isSubscriptionWarning() &&
          dayjs(subscriptionExpire).diff(dayjs(), "days") <= 3 && (
            <Alert
              className="sticky top-0 z-10"
              message={
                <span>
                  {t("SerialKeyWilBeExpiredSoon")}
                  <Popover
                    placement="bottom"
                    visible={isPopoverVisible}
                    onVisibleChange={(visible) => setIsPopoverVisible(visible)}
                    trigger="hover"
                    content={
                      <PopOverContent
                        website={"https://www.puretik.com/ar"}
                        email={"info@puretik.com"}
                        phone={"07710553120"}
                      />
                    }
                  >
                    <a
                      onMouseEnter={showPopover}
                      style={{ textDecoration: "underline", cursor: "pointer" }}
                    >
                      {t("here")}
                    </a>
                  </Popover>
                </span>
              }
              banner
              closable
            />
          )}
        {planType === "FREE" && (
          <Alert
            className="sticky top-0 z-10"
            message={
              <span>
                {`${t("freePlanAlert")}`}
                <Popover
                  placement="bottom"
                  title={t("")}
                  visible={isPopoverVisible}
                  onVisibleChange={(visible) => setIsPopoverVisible(visible)}
                  trigger="hover"
                  content={
                    <PopOverContent
                      website={"https://www.puretik.com/ar"}
                      email={"info@puretik.com"}
                      phone={"07710553120"}
                    />
                  }
                >
                  <a
                    onMouseEnter={showPopover}
                    style={{ textDecoration: "underline", cursor: "pointer" }}
                  >
                    {t("here")}
                  </a>
                </Popover>
              </span>
            }
            banner
            closable
          />
        )}
        {children}
      </Content>
      <Modal
        open={isSubscriptionWarning()}
        closable={false}
        centered
        footer={null}
      >
        <div className="text-center pt-10">
          <div>
            <WarningFilled className="text-orange-400 text-[60px]" />
          </div>
          <b className="block mt-4 text-[16px]">
            {t("SubscriptionAlertTitle")}
          </b>
          <p className="block !mt-2 text-[#a5a5a5]">
            {t("SubscriptionAlertMsg")}{" "}
          </p>
          <Popover
            // placement="top"
            title={
              <div className="text-center font-medium">{t("ContactUs")}</div>
            }
            content={
              <PopOverContent
                website={"https://www.puretik.com/ar"}
                email={"info@puretik.com"}
                phone={"07710553120"}
              />
            }
            trigger="click"
          >
            <Button className="mt-8" size="large" block>
              {t("ContactUs")}
            </Button>
          </Popover>
        </div>
      </Modal>
    </Layout>
  );
};

export default MainContainerV2;
