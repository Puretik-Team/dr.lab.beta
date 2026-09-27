import React, { useEffect, useState } from "react";
import "./style.css";
import {
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  message,
  Popconfirm,
  Popover,
  Radio,
  Row,
  Space,
  Tag,
  Modal,
  Tooltip,
  Typography,
} from "antd";
import {
  UserOutlined,
  ExportOutlined,
  ImportOutlined,
  CrownFilled,
  ExclamationCircleOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { send } from "../../control/renderer";
import { useAppStore, useLanguage } from "../../libs/appStore";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import PopOverContent from "./PopOverContent";
import { apiCall } from "../../libs/api";
import PrinterSelector from "./PrinterSelector";
import { signout } from "../../helper/signOut";
import { leaveLab } from "../../helper/leaveLab";
import { usePlan } from "../../hooks/usePlan";
import { useAppTheme } from "../../hooks/useAppThem";
import useInitHeaderImage from "../../hooks/useInitHeaderImage";
import { PDFSettings } from "./pdfSettings";
import PDFPreviewCard from "./PDFPreviewCard";
import useSyncStatus from "../../hooks/useSyncStatus";
import useLabUsers from "../../hooks/useLabUsers";
import useCurrentUser from "../../hooks/useCurrentUser";

const SettingsScreen = () => {
  // const [imagePath, setImagePath] = useState(null);
  // const [imagePathLoading, setImagePathLoading] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signoutLoading, setSignoutLoading] = useState(false);
  const [leaveLabLoading, setLeaveLabLoading] = useState(false);
  const { lang, setLang } = useLanguage();
  const { appColors } = useAppTheme();
  const {
    user,
    isOnline,
    setPrintFontSize,
    printFontSize,
    setAutoRefreshSeconds,
    autoRefreshSeconds,
    setIsLogin,
    setImagePath,
  } = useAppStore();
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [warning, setWarning] = useState(true);
  const [modal, contextHolder] = Modal.useModal();
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState(
    localStorage.getItem("selectedPrinter") || "",
  );
  const { generateHeader, fetchHeader } = useInitHeaderImage();
  const { state: syncState } = useSyncStatus();
  const isAccountSynced = syncState !== "disabled";
  const { users: labUsers, loading: labUsersLoading } = useLabUsers();
  const {
    isOwner,
    name: profileName,
    phone: profilePhone,
    username: profileUsername,
    role: profileRole,
    update: updateCurrentUser,
  } = useCurrentUser();
  const [profileForm] = Form.useForm();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  const openProfileModal = () => {
    profileForm.setFieldsValue({ name: profileName, username: profileUsername });
    setIsProfileModalOpen(true);
  };

  const handleSaveProfile = async (values) => {
    setProfileSaving(true);
    try {
      const resp = await apiCall({
        method: "PUT",
        pathname: "/app/user",
        isFormData: false,
        auth: true,
        data: { name: values.name, username: values.username },
      });

      if (resp.ok) {
        const data = await resp.json();
        updateCurrentUser({ name: data.name, username: data.username || "" });
        message.success(t("UpdateSuccess"));
        setIsProfileModalOpen(false);
      } else {
        const errorData = await resp.json();
        message.error(errorData.error || t("SomethingWentWrong"));
      }
    } catch (error) {
      message.error(error.message || t("SomethingWentWrong"));
    } finally {
      setProfileSaving(false);
    }
  };

  const { getPrintUsed, printLimit, subscriptionExpire, registerAt, planType } =
    usePlan();

  const { t } = useTranslation();

  // async function fetchImagePath() {
  //   setImagePath(null);
  //   try {
  //     const response = await fetch(`http://localhost:3009/head.png`);
  //     if (!response.ok) {
  //       throw new Error("Network response was not ok");
  //     }
  //     const imageURL = response.url;
  //     setImagePath(imageURL);
  //   } catch (error) {
  //     console.error("Failed to load image:", error);
  //   }
  // }

  // useEffect(() => {
  //   fetchImagePath();
  // }, []);

  useEffect(() => {
    if (user) form.setFieldsValue(user);
  }, [user, form]);

  useEffect(() => {
    const labUserRow = JSON.parse(localStorage.getItem("lab-user"));
    if (labUserRow) form.setFieldsValue(labUserRow);
  }, []);

  // const handleSizeChange = (val) => {
  //   localStorage.setItem("lab-print-size", val);
  //   setPrintFontSize(val);
  // };

  const handleAutoRefreshChange = (val) => {
    localStorage.setItem("lab-auto-refresh-seconds", val);
    setAutoRefreshSeconds(val);
  };

  const handelCancel = () => {
    const labUserRow = JSON.parse(localStorage.getItem("lab-user"));
    if (labUserRow) {
      form.setFieldsValue(labUserRow);
      setIsUpdate(false);
    }
  };

  // const handleChangeFile = async () => {
  //   try {
  //     const files = await fileDialog();
  //     if (!files || files.length === 0) return;

  //     const selectedFile = files[0];
  //     const fileName = selectedFile.name.toLowerCase();

  //     const validExtensions = [".png", ".jpg", ".jpeg", ".webp"];
  //     const isImageFile = validExtensions.some((ext) => fileName.endsWith(ext));

  //     if (!isImageFile) {
  //       message.error(t("PleaseSelectImageFile"));
  //       return;
  //     }

  //     setImagePathLoading(true);
  //     const saveResponse = await send({
  //       query: "saveHeadImage",
  //       file: selectedFile.path,
  //     });

  //     if (saveResponse.success) {
  //       setImagePathLoading(true);
  //       setImagePath(null);
  //       await fetchHeader(user);
  //       setImagePathLoading(false);
  //       message.success(t("ImageUploadedSuccessfully"));
  //     } else {
  //       throw new Error(saveResponse.error);
  //     }
  //   } catch (error) {
  //     console.error("Error uploading image:", error);
  //     message.error(t("ErrorUploadingImage"));
  //   }
  // };

  const handleUpdateClient = async (values) => {
    form.validateFields().then((values) => {
      console.log("Submit:", values);
    });
    setLoading(true);

    send({ query: "getUUID" }).then(async ({ UUID }) => {
      let data = {
        name: values.name,
        labName: values.labName,
        device: UUID,
        address: values.address,
        email: values.email,
      };
      try {
        const resp = await apiCall({
          method: "PUT",
          pathname: "/app/update-client",
          isFormData: false,
          auth: true,
          data,
        });

        if (resp.ok) {
          let data = await resp.json();
          localStorage.setItem("lab-user", JSON.stringify(data.updatedClient));
          message.success(t("UpdateSuccess"));
          setIsUpdate(false);

          // modal.confirm({
          //   title: "Confirm",
          //   icon: <ExclamationCircleOutlined />,
          //   content: "هل تريد اعادة انشاء صورة الغلاف حسب المعلومات الجديدة ؟",
          //   okText: "نعم",
          //   cancelText: "لا",
          //   onOk: async () => {
          //     try {
          //       //setImagePathLoading(true);
          //       await generateHeader(values);
          //       setImagePath(null);
          //       // const imageURL = await loadImage();
          //       // if (imageURL) setImagePath(imageURL);
          //      // setImagePathLoading(false);
          //       message.success("تم إنشاء صورة الغلاف بنجاح");
          //     } catch (err) {
          //       message.error("حدث خطأ أثناء إنشاء صورة الغلاف");
          //       console.error(err);
          //     }
          //   },
          // });
        } else {
          let errorData = await resp.json();
          console.error("Update failed:", errorData);
          message.error(
            `Update failed: ${errorData.message || "Unknown error"}`,
          );
        }
      } catch (error) {
        message.error(error.message);
      } finally {
        setLoading(false);
      }
    });
  };

  const handleLang = (val) => {
    const newLanguage = val.target.value;
    i18n.changeLanguage(newLanguage);
    setLang(newLanguage);
    document.documentElement.dir = newLanguage === "en" ? "ltr" : "rtl";
  };

  const handleExportDatabase = async () => {
    setExportLoading(true);
    const res = await send({ query: "exportDatabaseFile" });
    if (res.success) {
      message.success(res?.message);
    } else message.error(res?.message);
    setExportLoading(false);
  };

  const handleImportDatabase = async () => {
    setImportLoading(true);
    const res = await send({ query: "ImportDatabaseFile" });
    if (res.success) {
      message.success(res?.message);
    } else message.error(res?.message);

    setImportLoading(false);
  };

  const handlePrinterSelect = (printer) => {
    setSelectedPrinter(printer);
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

  const handleLeaveLab = () => {
    modal.confirm({
      title: t("LeaveLabConfirmTitle"),
      icon: <ExclamationCircleOutlined />,
      okText: t("LeaveLabConfirmOk"),
      okType: "danger",
      cancelText: t("Cancel"),
      content: t("LeaveLabConfirmDescription"),
      centered: true,
      onOk: async () => {
        try {
          await leaveLab(setLeaveLabLoading, setIsLogin, navigate);
        } catch (error) {
          console.error("Error leaving lab:", error);
          message.error(t("LeaveLabError"));
        }
      },
    });
  };

  useEffect(() => {
    const hasEmpty = Object.values(form.getFieldsValue()).some(
      (val) => val === undefined || val === null || val === "",
    );
    setWarning(hasEmpty);
  }, [form]);

  const onValuesChange = (_, allValues) => {
    const hasEmpty = Object.values(allValues).some(
      (val) => val === undefined || val === null || val === "",
    );
    setWarning(hasEmpty);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) {
      message.warning(t("PleaseEnterFeedback") || "Please enter your feedback");
      return;
    }

    setFeedbackLoading(true);
    try {
      // Get user info from form
      const formValues = form.getFieldsValue();
      const labUserRow = JSON.parse(localStorage.getItem("lab-user") || "{}");

      // Send email with user info and feedback
      const result = await send({
        query: "sendEmail",
        data: {
          name: formValues.name || labUserRow.name || user?.fullName || "N/A",
          labName: formValues.labName || labUserRow.labName || "N/A",
          phone: formValues.phone || labUserRow.phone || user?.phone || "N/A",
          feedback: feedbackText,
        },
      });

      if (result.success) {
        message.success(
          t("FeedbackSentSuccessfully") || "Feedback sent successfully!",
        );
        setFeedbackText(""); // Clear the textarea
      } else {
        message.error(t("ErrorSendingFeedback") || "Error sending feedback");
      }
    } catch (error) {
      console.error("Error sending feedback:", error);
      message.error(t("ErrorSendingFeedback") || "Error sending feedback");
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <div className="settings-page pb-[60px] page">
      <div className="border-none  p-[2%]">
        <section className="flex items-center justify-between w-full mb-[34px]">
          <div className="flex items-center gap-4">
            <Avatar size={"large"} icon={<UserOutlined />} />
            <div>
              <div className="flex items-center gap-2">
                <b className="text-[16px]">{profileName}</b>
                <Tag
                  color={profileRole === "owner" ? "gold" : "blue"}
                  className="m-0"
                >
                  {profileRole === "owner" ? t("Owner") : t("Operator")}
                </Tag>
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={openProfileModal}
                />
              </div>
              <span className="text-[14px] text-[#A5A5A5] block">
                {profilePhone}
              </span>
            </div>
          </div>

          <Space size={28}>
            <Space>
              {/* <span className="m-0 p-0">{t("SystemLanguage")} </span> */}
              <Radio.Group defaultValue={lang} onChange={handleLang}>
                <Radio.Button value="ar">عربي</Radio.Button>
                {/* <Radio.Button value="ku">کوردی</Radio.Button> */}
                <Radio.Button value="en">English</Radio.Button>
              </Radio.Group>
            </Space>
            <Divider type="vertical" />
            <Popconfirm
              placement="rightBottom"
              onConfirm={handleSignout}
              title={t("SignoutConfirm")}
              description={t("SignOutFormThisApp")}
            >
              <Button loading={signoutLoading} danger>
                {t("SignOut")}
              </Button>
            </Popconfirm>
          </Space>
        </section>

        <section>
          <p className="pl-[4px] opacity-60">
            {t("AccountInfo")}{" "}
            {warning && (
              <span className="text-orange-500 text-[14px]">
                ({t("PleaseFillRequiredFields")})
              </span>
            )}
            {!isOwner && (
              <span className="text-[13px] text-[#A5A5A5]">
                {" "}
                — {t("OnlyOwnerCanEdit")}
              </span>
            )}
          </p>
          <Card
            className={"mt-[6px]"}
            style={
              warning
                ? {
                    borderColor: appColors.userWarning,
                  }
                : {}
            }
          >
            <div className="pattern-isometric pattern-indigo-400 pattern-bg-white pattern-size-6 pattern-opacity-5 absolute inset-0"></div>
            <Form
              form={form}
              onFinish={handleUpdateClient}
              onFieldsChange={() => {
                setIsUpdate(true);
              }}
              onValuesChange={onValuesChange}
              layout="vertical"
              autoComplete="off"
            >
              <Row gutter={[20, 0]}>
                <Col span={6}>
                  <Form.Item
                    label={t("FullName")}
                    name="name"
                    rules={[
                      {
                        required: true,
                        message: t("PleaseInputYourName"),
                      },
                    ]}
                  >
                    <Input disabled={!isOwner} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label={t("LabName")} name="labName">
                    <Input disabled={!isOwner} />
                  </Form.Item>
                </Col>

                <Col span={6}>
                  <Form.Item
                    label={t("PhoneNumber")}
                    name="phone"
                    rules={[
                      {
                        required: true,
                        message: t("PleaseInputYourPhoneNumber"),
                      },
                    ]}
                  >
                    <Input readOnly />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={[20, 0]}>
                <Col span={6}>
                  <Form.Item label={t("Address")} name="address">
                    <Input disabled={!isOwner} />
                  </Form.Item>
                </Col>

                <Col span={6}>
                  <Form.Item label={t("Email")} name="email">
                    <Input type="email" disabled={!isOwner} />
                  </Form.Item>
                </Col>
                {isOwner && (isUpdate || loading) && (
                  <Col span={6}>
                    <Space>
                      <Form.Item label=" ">
                        <Button
                          loading={loading}
                          type="primary"
                          htmlType={t("submit")}
                        >
                          {t("SaveChanges")}
                        </Button>
                      </Form.Item>

                      <Button disabled={loading} onClick={handelCancel}>
                        {t("Cancel")}
                      </Button>
                    </Space>
                  </Col>
                )}
              </Row>
            </Form>
          </Card>
        </section>
        <Row gutter={[20, 20]} className="mt-[24px]">
          <Col span={12}>
            <section>
              <div>
                <p className="pl-[4px] opacity-60">{t("PDFSetting")}</p>
                <Card className="mt-[6px]">
                  <PDFSettings />
                </Card>
              </div>
              <div className="mt-[16px]">
                <p className="pl-[4px]">
                  <span className="opacity-60">{t("DatabaseManagement")}</span>
                  {planType === "FREE" && (
                    <CrownFilled className="text-[18px] text-[#faad14] ml-1" />
                  )}
                </p>

                <div
                  className="rounded-lg border mt-[8px]"
                  style={{ borderColor: appColors.colorBorder }}
                >
                  <div
                    className="border-b  p-[24px]"
                    style={{ borderColor: appColors.colorBorder }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <b className="text-[14px]">{t("ExportDatabase")}</b>
                        <p className="mt-2 text-sm text-gray-500">
                          {t("ExportDatabaseDescription")}
                        </p>
                      </div>
                      <Button
                        type="primary"
                        icon={<ExportOutlined />}
                        onClick={handleExportDatabase}
                        loading={exportLoading}
                        disabled={planType === "FREE" || isAccountSynced}
                      >
                        {t("ExportToDesktop")}
                      </Button>
                    </div>
                  </div>

                  <div className="p-[24px]">
                    <div className="flex justify-between items-center">
                      <div>
                        <b className="text-[14px]">{t("ImportDatabase")}</b>
                        <p className="mt-2 text-sm text-gray-500">
                          {t("ImportDatabaseDescription")}
                        </p>
                      </div>

                      <Button
                        type="primary"
                        icon={<ImportOutlined />}
                        onClick={handleImportDatabase}
                        disabled={planType === "FREE" || isAccountSynced}
                        loading={importLoading} // Changed to importLoading
                      >
                        {t("ImportToSystem")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-[16px]">
                <p className="pl-[4px] opacity-60">{t("LabUsers")}</p>

                <div
                  className="rounded-lg border mt-[8px]"
                  style={{ borderColor: appColors.colorBorder }}
                >
                  {labUsersLoading ? (
                    <div className="p-[24px] text-sm text-gray-500">
                      {t("Loading")}
                    </div>
                  ) : labUsers.length === 0 ? (
                    <div className="p-[24px] text-sm text-gray-500">
                      {t("NoLabUsers")}
                    </div>
                  ) : (
                    labUsers.map((labUser, index) => (
                      <div
                        key={labUser.id}
                        className={`flex justify-between items-center p-[24px] ${
                          index !== labUsers.length - 1 ? "border-b" : ""
                        }`}
                        style={{ borderColor: appColors.colorBorder }}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar icon={<UserOutlined />} />
                          <div>
                            <div className="flex items-center gap-2">
                              <b className="text-[14px]">{labUser.name}</b>
                              {labUser.phone === user?.phone && (
                                <Tag className="m-0">{t("You")}</Tag>
                              )}
                            </div>
                            <span className="text-[13px] text-[#A5A5A5]">
                              {labUser.phone}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[13px] text-gray-500">
                            {labUser.lastActive
                              ? dayjs(labUser.lastActive).format("YYYY MMM, DD")
                              : "—"}
                          </span>
                          <Tag
                            color={labUser.role === "owner" ? "gold" : "blue"}
                            className="m-0"
                          >
                            {labUser.role === "owner"
                              ? t("Owner")
                              : t("Operator")}
                          </Tag>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-[16px]">
                <p className="pl-[4px] opacity-60">{t("DangerZone")}</p>

                <div
                  className="rounded-lg border mt-[8px] p-[24px]"
                  style={{ borderColor: appColors.userWarning || "#ff4d4f" }}
                >
                  <div className="flex justify-between items-start gap-6">
                    <div>
                      <b className="text-[14px]">{t("LeaveLab")}</b>
                      <p className="mt-2 text-sm text-gray-500">
                        {t("LeaveLabDescription")}
                      </p>
                    </div>
                    <Tooltip
                      title={!isOnline ? t("OfflineActionDisabled") : ""}
                    >
                      <Button
                        danger
                        className="shrink-0"
                        disabled={!isOnline}
                        onClick={handleLeaveLab}
                        loading={leaveLabLoading}
                      >
                        {t("LeaveLab")}
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </section>
          </Col>
          <Col span={12}>
            <div>
              <PDFPreviewCard />
            </div>
            <div className="mt-[16px]">
              <p className="pl-[4px] opacity-60">{t("SubscriptionInfo")}</p>
              <Card className="mt-[6px]">
                <div className="flex flex-col w-full gap-[10px]">
                  <div className="w-full flex justify-between inter px-1 leading-[16.94px]">
                    <p>{t("startedAt")}</p>
                    <p className="text-[#A5A5A5] font-normal text-sm">
                      {dayjs(registerAt).format("YYYY MMM, DD")}
                    </p>
                  </div>

                  {planType === "SUBSCRIPTION" && (
                    <div className="w-full flex justify-between inter px-1 leading-[16.94px]">
                      <p className="font-normal text-sm">{t("expiredAt")}</p>
                      <p className="text-[#A5A5A5] font-normal text-sm">
                        {dayjs(subscriptionExpire).format("YYYY MMM, DD")}
                      </p>
                    </div>
                  )}

                  {/* <div className="w-full flex justify-between inter px-1">
                    <p className="font-normal text-sm">{t("whatsappLimit")}</p>
                    <p className="text-[#A5A5A5] font-normal text-sm">
                      {whatsappLimit === 0
                        ? t("noMessagesAvailable")
                        : whatsappLimit}
                    </p>
                  </div> */}

                  <div className="w-full flex justify-between inter px-1">
                    <p className="font-normal text-sm">{t("printLimit")}</p>

                    <p className="text-[#A5A5A5] font-normal text-sm">
                      {planType === "FREE"
                        ? `${getPrintUsed() || 0}/${printLimit}`
                        : "Unlimited"}
                    </p>
                  </div>
                  <div className="w-full flex justify-between inter px-1">
                    <p className=" font-normal text-sm">
                      {t("accountTypeLeft")}
                    </p>

                    <Tag color="magenta-inverse" className="m-0">
                      {String(planType || "").toLocaleUpperCase()}
                    </Tag>
                  </div>

                  {planType === "FREE" && (
                    <div
                      className="mt-2 p-2 bg-gradient-to-r    rounded-lg"
                      style={{ background: appColors.colorPrimaryHover }}
                    >
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium">
                          {t("WantToUpgrade")}
                        </p>
                        <Popover
                          placement="right"
                          title={
                            <div className="text-center font-medium">
                              {t("ContactUs")}
                            </div>
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
                          <Button
                            type="primary"
                            size="small"
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {t("UpgradeNow")}
                          </Button>
                        </Popover>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <div className="mt-[16px]">
                <p className="pl-[4px]">
                  <span className="opacity-60">{t("printer")} </span>
                  {planType === "FREE" && (
                    <CrownFilled className="text-[18px] text-[#faad14] ml-1" />
                  )}
                </p>

                <Card className="mt-[6px] ">
                  <div className="flex justify-between items-center">
                    <p className="py-2">
                      {selectedPrinter
                        ? selectedPrinter
                        : t("noPrinterSelected")}
                    </p>
                    <PrinterSelector onPrinterSelect={handlePrinterSelect} />
                  </div>
                </Card>
              </div>

              <div className="mt-[16px]">
                <p className="pl-[4px] opacity-60">{t("Feedback & Support")}</p>
                <Card className="mt-[6px]">
                  <div>
                    <b className="text-[14px]">
                      {t("Suggest a Feature or Report a Problem")}
                    </b>
                    <p className="mt-2 text-sm text-gray-500">
                      {t(
                        "We'd love to hear from you! Share your ideas or report any issues.",
                      )}
                    </p>
                    <Input.TextArea
                      className="mt-3"
                      placeholder={t("Type your suggestion or problem here...")}
                      rows={4}
                      maxLength={500}
                      showCount
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                    />
                    <div className="flex justify-end mt-8">
                      <Button
                        type="primary"
                        onClick={handleSubmitFeedback}
                        loading={feedbackLoading}
                      >
                        {t("Submit Feedback")}
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </Col>
        </Row>
      </div>
      {contextHolder}

      <Modal
        title={t("EditProfile")}
        open={isProfileModalOpen}
        onCancel={() => setIsProfileModalOpen(false)}
        centered
        footer={
          <Space>
            <Button onClick={() => setIsProfileModalOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              type="primary"
              loading={profileSaving}
              onClick={profileForm.submit}
            >
              {t("SaveChanges")}
            </Button>
          </Space>
        }
      >
        <Form
          form={profileForm}
          layout="vertical"
          autoComplete="off"
          onFinish={handleSaveProfile}
        >
          <Form.Item
            label={t("FullName")}
            name="name"
            rules={[{ required: true, message: t("PleaseInputYourName") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t("Username")} name="username">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsScreen;
