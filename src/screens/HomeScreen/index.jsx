import {
  ClockCircleOutlined,
  EditOutlined,
  UsergroupAddOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Typography,
  Input,
  Space,
  Col,
  Row,
  Card,
  Divider,
  Button,
  Radio,
  Spin,
} from "antd";
import "./style.css";
import { PureModal, PureTable } from "../../components/Visits";
import {
  useHomeStore,
  useLanguage,
  useAppStore,
  usePatientStore,
  useDoctorStore,
} from "../../libs/appStore";
import { useTranslation } from "react-i18next";
import { QuickActionsModal } from "./quickActionModal";
import { useEffect, useState } from "react";
import { send } from "../../control/renderer";
import { useAppTheme } from "../../hooks/useAppThem";
import { PatientModal } from "../../components/Patients/Modal";
import { DoctorModal } from "../../components/Doctors/Modal";

const { Search } = Input;
function CardStatistics({ icon, title, value, loading }) {
  return (
    <Card styles={{ body: { padding: "12px 18px" } }}>
      <Space align="center" size={12}>
        <div className="w-[60px] h-[60px] rounded-[12px] bg-[#a343c91c] flex items-center justify-center">
          {icon}
        </div>
        <Divider type="vertical" />
        <div>
          <Typography.Text type="secondary">{title}</Typography.Text>
          <b className="text-[32px] block">{value.toLocaleString()}</b>
        </div>
      </Space>
    </Card>
  );
}

const HomeScreen = () => {
  const {
    setIsModal,
    // tests,
    setTests,
    setQuerySearch,
    setReset,
    // setSelectedTest,
    setIsQuickActionsModal,
  } = useHomeStore();

  const { setIsModal: openPatientModal } = usePatientStore();
  const { setIsModal: openDoctorModal } = useDoctorStore();

  const { isReload } = useAppStore();
  const { t, i18n } = useTranslation();
  const direction = i18n.dir();
  const { lang, setLang } = useLanguage();
  const { appColors } = useAppTheme();
  const [quickList, setQuickList] = useState([]);

  // Statistics state
  const [statistics, setStatistics] = useState({
    pendingResults: 0,
    todayVisits: 0,
    totalPatients: 0,
    totalVisits: 0,
  });
  const [statisticsLoading, setStatisticsLoading] = useState(false);

  // Fetch statistics function
  const fetchStatistics = async () => {
    // setStatisticsLoading(true);
    try {
      const [pendingRes, todayRes, totalPatientsRes] = await Promise.all([
        send({ query: "getPendingResults" }),
        send({ query: "getTodayVisits" }),
        send({ query: "getTotalPatients" }),
        // send({ query: "getTotalVisits", data: {} }),
      ]);

      setStatistics({
        pendingResults: pendingRes.success ? pendingRes.total : 0,
        todayVisits: todayRes.success ? todayRes.total : 0,
        totalPatients: totalPatientsRes.success ? totalPatientsRes.total : 0,
      });
    } catch (error) {
      console.error("Error fetching statistics:", error);
    } finally {
      // setStatisticsLoading(false);
    }
  };

  // Fetch statistics on component mount and reload
  useEffect(() => {
    fetchStatistics();
  }, [isReload]);

  const handleLang = (val) => {
    const newLanguage = val.target.value;
    i18n.changeLanguage(newLanguage);
    setLang(newLanguage);
    document.documentElement.dir = newLanguage === "en" ? "ltr" : "rtl";
  };

  const testByID = async (id) => {
    const resp = await send({
      query: "testByID",
      data: { id },
    });
    if (resp.success) {
      console.log("resp in testByID", resp);
      return resp.data;
    }
    return null;
  };

  const onClick = async ({ id }) => {
    setReset();
    if (id) {
      const test = await testByID(id);
      if (test) {
        setTests([{ ...test }]);
      }
    }
    setIsModal(true);
  };

  let actionButtonsRow = [];
  try {
    const savedActionButtons = localStorage.getItem("actionButtons");
    actionButtonsRow = savedActionButtons ? JSON.parse(savedActionButtons) : [];
  } catch (error) {
    console.error("Error parsing saved action buttons:", error);
  }

  // const actionButtons = [
  //   // Add other buttons from localStorage
  //   ...actionButtonsRow.map((item) => ({
  //     title: item.name_en,
  //     id: item.id,
  //     isPrimary: false,
  //     onClick: () => onClick({ id: item.id }),
  //   })),
  //   // Add static "Other Tests" button first
  //   {
  //     title: "Other Tests",
  //     isPrimary: true,
  //     onClick: () => onClick({ id: null }),
  //   },
  // ];

  const fetchActionButtons = async () => {
    try {
      const resp = await send({
        query: "getTopTests",
      });

      if (resp?.success && resp?.data?.length) {
        const list = resp.data.map((item) => ({
          ...item,
          onClick: () => onClick({ id: item.id }),
        }));

        localStorage.setItem("actionButtons", JSON.stringify(list));
        setQuickList([
          ...list,
          {
            title: "Other Tests",
            isPrimary: true,
            onClick: () => onClick({ id: null }),
          },
        ]);
      } else {
        setQuickList([
          {
            title: "Other Tests",
            isPrimary: true,
            onClick: () => onClick({ id: null }),
          },
        ]);
      }
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    let quickListRow = [];
    try {
      quickListRow = JSON.parse(localStorage.getItem("actionButtons")) || [];
    } catch (e) {
      quickListRow = [];
    }
    // An empty cache means we never got a real list (or a stale build wiped
    // it) — refetch instead of showing only the static button forever.
    if (quickListRow.length === 0) {
      fetchActionButtons();
    } else {
      const list = [
        ...quickListRow?.map((item) => ({
          ...item,
          onClick: () => onClick({ id: item.id }),
        })),
        {
          title: "Other Tests",
          isPrimary: true,
          onClick: () => onClick({ id: null }),
        },
      ];
      setQuickList(list);
    }
  }, []);

  return (
    <div className="home-screen page pb-[50px]">
      <div className="border-none p-[2%]">
        <Row gutter={[16, 16]}>
          <Col span={17}>
            <div className="grid grid-cols-3 gap-4">
              <CardStatistics
                title={t("PendingResults")}
                value={statistics?.pendingResults || 0}
                // loading={statisticsLoading}
                icon={
                  <ClockCircleOutlined className="text-[#a343c9] text-[28px]" />
                }
              />
              <CardStatistics
                title={t("Today'sVisits")}
                value={statistics?.todayVisits || 0}
                // loading={statisticsLoading}
                icon={
                  <UsergroupAddOutlined className="text-[#a343c9] text-[28px]" />
                }
              />
              <CardStatistics
                title={t("TotalPatients")}
                value={statistics?.totalPatients || 0}
                // loading={statisticsLoading}
                icon={<UserOutlined className="text-[#a343c9] text-[28px]" />}
              />
            </div>
            <Card
              className="mt-4 overflow-hidden"
              styles={{ body: { padding: 0 } }}
              title={
                <div className="app-flex-space w-full font-normal">
                  <Typography.Text className="font-bold">
                    {t("RecentVisits")}
                  </Typography.Text>
                  <Space size={16}>
                    <Search
                      name="search"
                      placeholder={t("SearchPatient")}
                      onSearch={(val) => setQuerySearch(val)}
                      style={{
                        width: 270,
                      }}
                      className={`${direction === "rtl" ? "search-input" : ""}`}
                      dir={direction}
                    />
                  </Space>
                </div>
              }
            >
              <PureTable
                ignore={["price", "endPrice", "discount"]}
                borderd={false}
                noTodayFilter={true}
              />
            </Card>
          </Col>
          <Col span={7}>
            <Card
              style={{
                background: appColors?.colorPrimaryHover,
              }}
              className="shadow-md"
              //className="relative bg-gradient-to-r from-purple-500/20 to-blue-500/10 backdrop-purple-md"
              styles={{
                title: {
                  fontSize: 14,
                  fontWeight: "normal",
                  opacity: 0.8,
                },
              }}
              title={
                <div className="app-flex-space w-full">
                  <Typography.Text>{t("QuickActions")}</Typography.Text>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => setIsQuickActionsModal(true)}
                  />
                </div>
              }
            >
              <Space wrap size={12}>
                {quickList?.map((button, index) => (
                  <div
                    key={index}
                    className="px-3 py-1.5 text-[14px] rounded-md  cursor-pointer shadow-md hover:scale-105 active:scale-95 transition-all"
                    style={
                      button.isPrimary
                        ? { background: "#9053e7", color: "#fff" }
                        : {
                            background: appColors?.bgColor,
                            border: "1px solid",
                            borderColor: appColors?.colorBorder,
                          }
                    }
                    onClick={() => onClick({ id: button.id })}
                  >
                    {button?.title}
                  </div>
                ))}
              </Space>

              <Divider />

              <div
                className="mt-4 p-4 rounded-[8px] shadow-lg"
                style={{
                  background: appColors?.bgColor,
                }}
              >
                <Space size={12} wrap>
                  <Button
                    className="flex-1"
                    onClick={() => openPatientModal(true)}
                  >
                    + New Patient
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => openDoctorModal(true)}
                  >
                    + New Doctor
                  </Button>
                  <Radio.Group defaultValue={lang} onChange={handleLang}>
                    <Radio.Button value="ar">عربي</Radio.Button>
                    {/* <Radio.Button value="ku">کوردی</Radio.Button> */}
                    <Radio.Button value="en">English</Radio.Button>
                  </Radio.Group>
                </Space>
              </div>
            </Card>
          </Col>
        </Row>

        <PureModal />
        <PatientModal />
        <DoctorModal />
        {/* <ResultsModal /> */}
        <QuickActionsModal
          onSave={(list) =>
            setQuickList([
              ...list,
              {
                title: "Other Tests",
                isPrimary: true,
                onClick: () => onClick({ id: null }),
              },
            ])
          }
        />
      </div>
    </div>
  );
};

export default HomeScreen;
