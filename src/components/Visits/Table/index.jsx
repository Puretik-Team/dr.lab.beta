import {
  ManOutlined,
  WomanOutlined,
  EditOutlined,
  DeleteOutlined,
  WhatsAppOutlined,
  BarcodeOutlined,
} from "@ant-design/icons";
import {
  Button,
  Divider,
  Pagination,
  Space,
  Table,
  Tag,
  Popconfirm,
  message,
  Popover,
  Input,
  Checkbox,
  Tooltip,
} from "antd";
import "./style.css";
import dayjs from "dayjs";
import { useEffect, useState, useRef } from "react";
import { send } from "../../../control/renderer";
import { useAppStore, useHomeStore, useTrigger } from "../../../libs/appStore";
import usePageLimit from "../../../hooks/usePageLimit";
import { useTranslation } from "react-i18next";
import { ResultsModal } from "../ResultsModal";
import PopOverContent from "../../../screens/SettingScreen/PopOverContent";
import { useAppTheme } from "../../../hooks/useAppThem";
import { BarcodeModal } from "../BarcodeModal/barcodeModal";
import { apiCall } from "../../../libs/api";
import { usePlan } from "../../../hooks/usePlan";
import { ensureReportDesign } from "../../../screens/TemplatesScreen/designGate";
// import { sendWhatsApp } from "../../../helper/whatsapp";

export const PureTable = ({
  isReport = false,
  ignore = [],
  borderd = true,
  noTodayFilter = false,
  filter,
}) => {
  const { isReload, setIsReload, user } = useAppStore();
  const {
    setIsModal,
    setId,
    setDiscount,
    setTests,
    setCreatedAt,
    querySearch,
    isToday,
    setPatientRow,
    setDoctorRow,
  } = useHomeStore();

  const [data, setData] = useState([]);
  const [record, setRecord] = useState(null);
  const [isResultsModal, setIsResultsModal] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [msgLoading, setMsgLoading] = useState(false);
  const [isConfirm, setIsConfirm] = useState(false);
  const [destPhone, setDestPhone] = useState(null);
  const [sendWithQR, setSendWithQR] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isBarcodeModal, setIsBarcodeModal] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [hideVisitsWithHiddenTests, setHideVisitsWithHiddenTests] = useState(
    localStorage.getItem("hideVisitsWithHiddenTests") === "true"
  );
  const timeoutRef = useRef(null);

  const [userType] = useState(
    JSON.parse(localStorage.getItem("lab-user"))?.Plan?.type
  );
  const { flag, setFlag } = useTrigger();
  const { planType } = usePlan();

  const limit = usePageLimit();
  const { t, i18n } = useTranslation();
  const { appColors } = useAppTheme();

  const direction = i18n.dir();

  const phoneValidate = (phone) => {
    if (phone?.length < 11) return false;
    const regex = /^[\u0621-\u064A\u0660-\u0669]+|07[3-9]\d{1,11}$/;
    const result = regex.exec(phone);
    return result;
  };
  const statusColor = {
    PENDING: "orange",
    COMPLETED: "green",
    REPORTED: "blue",
  };

  const handlePrintBarcode = async (record) => {
    setRecord(record);
    setIsBarcodeModal(true);
  };

  const updatePatient = async (record, phone) => {
    let patientData = { ...record.patient, phone };
    try {
      const resp = await send({
        query: "updatePatient",
        id: record.patient.id,
        data: patientData,
      });

      if (resp.success) {
        setIsReload(!isReload);
      } else {
        console.error("Error updating patient:", resp.error);
      }
    } catch (error) {
      console.error("Error in IPC communication:", error);
    }
  };

  const handleSandWhatsap = async (record) => {
    if (!(await ensureReportDesign(planType))) return;
    setMsgLoading(true);
    console.log(record);
    try {
      if (destPhone !== record?.patient?.phone)
        await updatePatient(record, destPhone);
      let phone = destPhone;
      if (!phoneValidate(phone)) {
        message.error("رقم الهاتف غير صحيح!");
        return;
      } else if (phone[0] === "0") phone = phone.substr(1);

      // Get print settings from localStorage or use defaults
      const fontSize =
        parseInt(localStorage.getItem("lab-print-size"), 10) || 10;
      const headerEmpty = localStorage.getItem("lab-header-empty") === "true";
      const headerHeight = localStorage.getItem("lab-header-height")
        ? parseInt(localStorage.getItem("lab-header-height"), 10)
        : null;
      const footerEmpty = localStorage.getItem("lab-footer-empty") === "true";
      const footerHeight = localStorage.getItem("lab-footer-height")
        ? parseInt(localStorage.getItem("lab-footer-height"), 10)
        : null;
      const tableHeaderColor = localStorage.getItem("lab-table-header-color") || null;
      const tableHeaderTextColor = localStorage.getItem("lab-table-header-text-color") || null;
      let labInfo = null;
      try {
        const labUser = JSON.parse(localStorage.getItem("lab-user"));
        if (labUser) {
          labInfo = {
            name: labUser.labName,
            phone: labUser.phone,
            address: labUser.address,
          };
        }
      } catch {}

      const { success, file } = await send({
        query: "printVisit",
        data: {
          isView: false,
          visit: record,
          fontSize,
          planType,
          withQR: sendWithQR,
          headerEmpty,
          headerHeight,
          footerEmpty,
          footerHeight,
          labInfo,
          tableHeaderColor,
          tableHeaderTextColor,
        },
      });

      if (!success || !file) {
        message.error("Error when createing pdf");
        setMsgLoading(false);
        return;
      }

      let pdf = new Blob(file.arrayBuffer, { type: "application/pdf" });
      const formData = new FormData();
      formData.append("phone", phone);
      formData.append("file", pdf, "report.pdf");
      const uploadResp = await apiCall({
        method: "POST",
        pathname: "/app/upload-pdf",
        isFormData: true,
        data: formData,
        auth: true,
      });

      if (uploadResp?.status !== 200) {
        message.error("Error Uploading file .!");
        setMsgLoading(false);
        return;
      }

      const { pdfUrl } = await uploadResp.json();

      if (!pdfUrl) {
        message.error("Error Uploading file .!");
        setMsgLoading(false);
        return;
      }

      setMsgLoading(false);
      const resp = await send({
        query: "sendWhatsapp",
        data: {
          phone: destPhone,
          text: `يهديكم ${user?.labName} تحياته\nنرفق لكم رابط نتائج التحاليل الخاصة بكم،\nمع تمنياتنا لكم بالصحة والعافية.`,
          link: pdfUrl,
          cc: "964",
        },
      });

      if (!resp.success) {
        message.error("Error Sending message!.");
        setMsgLoading(false);
        console.error("Error updating patient:", resp.error);
      }
    } catch (error) {
      setMsgLoading(false);
      message.error("Error Sending message!.");
      console.error("Error in IPC communication:", error);
    } finally {
      setMsgLoading(false);
    }
  };

  // const handleSandWhatsap = async (record) => {
  //   setMsgLoading(true);
  //   if (destPhone !== record?.phone) await updatePatient(record, destPhone);
  //   let phone = destPhone;
  //   if (!phoneValidate(phone)) {
  //     message.error("رقم الهاتف غير صحيح!");
  //     return;
  //   } else if (phone[0] === "0") phone = phone.substr(1);

  //   try {
  //     let pdf;

  //     let printResults = () => {
  //       return new Promise((resolve, reject) => {
  //         const planType = JSON.parse(localStorage?.getItem("lab-user"))?.Plan
  //           ?.type;
  //         let data = {
  //           patient: record.patient.name,
  //           age: dayjs().diff(dayjs(record.patient.birth), "y"),
  //           date: dayjs(record.createdAt).format("YYYY-MM-DD"),
  //           tests: parseTests(record),
  //           isHeader: true,
  //           fontSize: 12,
  //           isFree: planType === "FREE",
  //         };

  //         send({
  //           query: "print",
  //           data,
  //           isView: false,
  //         }).then(({ err, res, file }) => {
  //           if (err) {
  //             console.error("Error generating PDF:", err);
  //             reject(err);
  //           }
  //           if (file) {
  //             resolve(file);
  //           } else {
  //             reject(new Error("No file returned"));
  //           }
  //           console.log(err, res, file);
  //         });
  //       });
  //     };

  //     let handleSubmit = async () => {
  //       let data = { ...record, status: "COMPLETED", updatedAt: Date.now() };

  //       send({
  //         doc: "visits",
  //         query: "updateVisit",
  //         data: { ...data },
  //         id: record?.id,
  //       }).then(({ err }) => {
  //         if (err) message.error("Error !");
  //         else {
  //           setRecord(null);
  //           setIsResultsModal(false);
  //           setIsReload(!isReload);
  //           setTimeout(async () => {
  //             try {
  //               const res = await printResults();
  //               pdf = new Blob(res.arrayBuffer, { type: "application/pdf" });
  //               const formData = new FormData();
  //               formData.append("name", record?.patient?.name);
  //               formData.append("phone", phone);
  //               formData.append("file", pdf, "report.pdf");
  //               const resp = await apiCall({
  //                 method: "POST",
  //                 pathname: "/app/whatsapp-message",
  //                 isFormData: true,
  //                 data: formData,
  //                 auth: true,
  //               });

  //               if (resp?.ok) {
  //                 const response = await resp.json();
  //                 setMsgLoading(false);
  //                 await initUser();
  //                 message.success(response?.message);

  //                 try {
  //                   if (isOnline && window.gtag) {
  //                     window.gtag("event", "click", {
  //                       event_category: "button",
  //                       event_label: "whatsapp-message-button",
  //                       value: 1,
  //                     });
  //                   }
  //                 } catch (e) {
  //                   throw new Error(e.message);
  //                 }
  //               } else {
  //                 message.error(response?.error);
  //               }
  //             } catch (error) {
  //               console.error("Error generating PDF:", error);
  //               message.error("Error!.");
  //               setMsgLoading(false);
  //             }
  //           }, 100);
  //         }
  //       });
  //     };

  //     await handleSubmit();
  //   } catch (error) {
  //     console.error("Error generating PDF or sending data:", error);
  //     message.error(t("erroroccurred"));
  //     setMsgLoading(false);
  //   }
  // };

  const whatsapContnet = (record) => (
    <div div className="whatsap-content">
      <WhatsAppOutlined style={{ fontSize: 40 }} />
      <b>{t("SendResults")}</b>
      <p>{t("SendResulsOnWhatsaap")}</p>
      <Input
        placeholder={t("EnterPhoneNumber")}
        value={destPhone}
        onChange={(e) => setDestPhone(e.target.value)}
      />

      <div className="mt-[12px]" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Checkbox
            checked={isConfirm}
            onChange={(e) => setIsConfirm(e.target.checked)}
          />
          <span className="text-[14px]">{t("ConfirmPhoneNumber")}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Checkbox
            checked={sendWithQR}
            onChange={(e) => setSendWithQR(e.target.checked)}
          />
          <span className="text-[14px]">{t("SendWithQRCode")}</span>
        </div>
      </div>

      <Divider />
      <Button
        loading={msgLoading}
        disabled={!isConfirm || !destPhone || !phoneValidate(destPhone)}
        onClick={() => handleSandWhatsap(record)}
        type="primary"
        block
      >
        {t("Send")}
      </Button>
    </div>
  );

  const rawColumns = [
    {
      title: t("Name"),
      dataIndex: "name",
      key: "name",
      render: (_, record) => (
        <Space size={16}>
          {record?.patient?.gender === "male" ? (
            <ManOutlined style={{ color: "#0000ff", fontSize: 16 }} />
          ) : (
            <WomanOutlined
              style={{ color: "rgb(235, 47, 150)", fontSize: 16 }}
            />
          )}
          <Space size={0} direction="vertical">
            <b>{record?.patient?.name}</b>
            {record?.doctor && (
              <small className="block -mt-[2px] opacity-60">
                {t("FROM")} {record?.doctor?.name}
              </small>
            )}
          </Space>
        </Space>
      ),
    },
    // {
    //   title: t("Gender"),
    //   dataIndex: "gender",
    //   key: "gender",
    //   render: (_, record) =>
    //     record?.patient?.gender === "male" ? (
    //       <ManOutlined style={{ color: "#0000ff", fontSize: 16 }} />
    //     ) : (
    //       <WomanOutlined style={{ color: "rgb(235, 47, 150)", fontSize: 16 }} />
    //     ),
    // },
    {
      title: t("Tests"),
      dataIndex: "tests",
      key: "tests",
      render: (_, record) => {
        const list = Array.isArray(record.tests) ? record.tests : [];
        const numOfView = 2;
        const restCount =
          list.length > numOfView ? list.length - numOfView : null;

        const getLabel = (item) =>
          item?.name_en || item?.name_ar || item?.code || "";

        return (
          <Space wrap size={[0, "small"]}>
            {list.slice(0, numOfView).map((el) => (
              <Tag key={el.visit_item_id || el.test_id || el.code}>
                {getLabel(el)}
              </Tag>
            ))}
            {restCount ? (
              <Popover
                content={
                  <div style={{ maxWidth: 300 }}>
                    <Space wrap>
                      {list.map((el) => (
                        <Tag
                          key={`all-${
                            el.visit_item_id || el.test_id || el.code
                          }`}
                        >
                          {getLabel(el)}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                }
              >
                <Tag>+{restCount}</Tag>
              </Popover>
            ) : null}
          </Space>
        );
      },
    },
    !ignore?.includes("price") && {
      title: t("Price"),
      dataIndex: "grossPrice",
      key: "grossPrice",
      render: (_, record) => {
        const hasDiscount = Number(record?.discount) > 0;
        return (
          <span
            style={
              hasDiscount
                ? {
                    textDecoration: "line-through",
                    opacity: 0.3,
                    fontStyle: "italic",
                  }
                : {}
            }
          >
            {Number(record?.grossPrice || 0).toLocaleString("en")} IQD
          </span>
        );
      },
    },
    !ignore?.includes("endPrice") && {
      title: t("EndPrice"),
      dataIndex: "endPrice",
      key: "endPrice",
      render: (_, record) => (
        <b style={{ whiteSpace: "nowrap" }}>
          {Number(record?.endPrice || 0).toLocaleString("en")} IQD
        </b>
      ),
    },
    !ignore?.includes("discount") && {
      title: t("Discount"),
      dataIndex: "discount",
      key: "discount",
      render: (_, record) =>
        Number(record?.discount) ? (
          <Tag color="geekblue">
            {Number(record?.discount).toLocaleString("en")} IQD
          </Tag>
        ) : (
          ". . ."
        ),
    },
    {
      title: t("CreatedAt"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (createdAt) => (
        <span style={{ color: "#666", fontSize: 14 }}>
          <span style={{ fontSize: 12 }}>
            {dayjs(createdAt).format("DD/MM/YYYY")}
          </span>{" "}
          {dayjs(createdAt).add(3, "hours").format("hh:mm A")}
        </span>
      ),
    },
    {
      title: t("Status"),
      dataIndex: "status",
      key: "status",
      render: (status) => <Tag color={statusColor[status]}>{status}</Tag>,
    },
    {
      ...(!isReport && {
        title: "",
        key: "action",
        render: (_, record) => (
          <Space size="small" className="custom-actions">
            <Button
              onClick={() => handleResults(record)}
              style={{ fontSize: 12 }}
              size="small"
            >
              {t("PrintResults")}
            </Button>

            <Tooltip title={t("PrintBarcode")}>
              <Button
                onClick={() => handlePrintBarcode(record)}
                style={{ fontSize: 12 }}
                size="small"
                icon={<BarcodeOutlined />}
                disabled={userType === "FREE"}
              />
            </Tooltip>

            <Divider type="vertical" />

            <Popover
              onOpenChange={(isOpen) => {
                if (isOpen) setDestPhone(record?.patient?.phone);
                else setIsConfirm(false);
              }}
              placement={direction === "ltr" ? "bottomRight" : "bottomLeft"}
              content={
                userType === "FREE" ? (
                  <PopOverContent
                    website={"https://www.puretik.com/ar"}
                    email={"puretik@gmail.com"}
                    phone={"07710553120"}
                  />
                ) : (
                  whatsapContnet(record)
                )
              }
              open={
                userType === "FREE"
                  ? undefined
                  : record?.status === "PENDING"
                  ? false
                  : undefined
              }
            >
              <Button
                size="small"
                className=" sticky"
                icon={<WhatsAppOutlined />}
                loading={msgLoading}
                disabled={record?.status === "PENDING" || userType === "FREE"}
              />
            </Popover>

            <Button
              size="small"
              disabled={record?.status === "COMPLETED"}
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />

            <Popconfirm
              title={t("DeleteTheRecord")}
              description={t("DeleteThisRecord")}
              onConfirm={() => handleRemove(record.id)}
              okText={t("Yes")}
              cancelText={t("No")}
              placement="leftBottom"
            >
              <Button danger size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      }),
    },
  ];

  const columns = rawColumns.filter(Boolean);

  //commit

  const handleResults = (record) => {
    setRecord(record);
    setIsResultsModal(true);
  };

  const handleRemove = (id) => {
    send({
      query: "deleteVisit",
      id,
    })
      .then((resp) => {
        if (resp.success) {
          message.success(t("Visitdeletedsuccessfully"));
          setIsReload(!isReload);
        } else {
          console.error("Error deleteVisit:", resp.error);
        }
      })
      .catch((err) => {
        console.error("Error in IPC communication:", err);
      });
  };

  const handleEdit = ({ id, patient, doctor, discount, tests, createdAt }) => {
    patient.birth = dayjs(patient.birth);
    console.log(tests?.map((el) => ({ ...el, id: el?.visit_item_id })));
    setPatientRow(patient);
    setDoctorRow(doctor);
    setId(id);
    setTests(tests?.map((el) => ({ ...el, id: el?.test_id })));
    setDiscount(discount);
    setIsModal(true);
    setCreatedAt(createdAt);
  };

  // Get hidden test IDs from localStorage
  const getHiddenTestIds = () => {
    try {
      const hidden = localStorage.getItem("hiddenTestIds");
      return hidden ? JSON.parse(hidden) : [];
    } catch {
      return [];
    }
  };

  // Check if a visit contains any hidden tests
  const visitContainsHiddenTests = (visit) => {
    const hiddenIds = getHiddenTestIds();
    if (hiddenIds.length === 0) return false;
    
    const visitTestIds = visit.tests?.map((test) => test.test_id) || [];
    return visitTestIds.some((testId) => hiddenIds.includes(testId));
  };

  const handleResultsClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setClickCount((prevCount) => {
      const newCount = prevCount + 1;
      
      if (newCount >= 3) {
        // Toggle hide/show visits with hidden tests
        const newState = !hideVisitsWithHiddenTests;
        setHideVisitsWithHiddenTests(newState);
        localStorage.setItem("hideVisitsWithHiddenTests", newState.toString());
        
        // Reload data
        setIsReload(!isReload);
        
        // Reset counter
        timeoutRef.current = setTimeout(() => {
          setClickCount(0);
        }, 100);
        return 0;
      } else {
        // Reset counter after 2 seconds if not reached 3
        timeoutRef.current = setTimeout(() => {
          setClickCount(0);
        }, 2000);
        return newCount;
      }
    });
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handelOpenModal = (data) => {
    const numberValue = Number(querySearch);
    let isBarcode = !isNaN(numberValue) && querySearch.length === 6;
    if (isBarcode && data.length === 1) {
      setRecord(data[0]);
      setIsResultsModal(true);
    }
  };

  useEffect(() => {
    setLoading(true);
    let startDate = "";
    let endDate = "";

    if (!noTodayFilter && !isReport && isToday) {
      startDate = dayjs().startOf("day").toISOString();
      endDate = dayjs().endOf("day").toISOString();
    } else if (isReport && filter?.filterDate) {
      startDate = filter?.filterDate
        ? dayjs(filter?.filterDate[0]).startOf("day").toISOString()
        : "";
      endDate = filter?.filterDate
        ? dayjs(filter?.filterDate[1]).endOf("day").toISOString()
        : "";
    }

    send({
      query: "getVisits",
      data: {
        q: querySearch,
        skip: (page - 1) * limit,
        limit,
        startDate,
        endDate,
        status: filter?.status || null,
        gender: filter?.gender || null,
        testId: filter?.testId || null,
      },
    }).then((resp) => {
      if (resp.success) {
        // Filter out visits containing hidden tests if toggle is on
        let filteredData = resp.data;
        let adjustedTotal = resp.total;
        
        if (hideVisitsWithHiddenTests) {
          filteredData = resp.data.filter(
            (visit) => !visitContainsHiddenTests(visit)
          );
          // Calculate how many visits were filtered out from the current page
          const hiddenCount = resp.data.length - filteredData.length;
          // Adjust the total by subtracting hidden visits
          adjustedTotal = resp.total - hiddenCount;
        }
        
        setData(filteredData);
        setTotal(adjustedTotal);
        handelOpenModal(filteredData);
      } else {
        console.error("Error retrieving visits:", resp.error);
      }
      setLoading(false);
      setFlag(false);
    });
  }, [page, isReload, querySearch, isToday, limit, flag, filter, hideVisitsWithHiddenTests]);

  const handleSaveResult = async (data) => {
    try {
      const resp = await send({
        query: "updateVisit",
        data,
      });

      if (resp?.success) {
        message.success("Results Saved.!");
        setRecord(null);
        setIsReload(!isReload);
        setIsResultsModal(false);
      } else message.error("Error!.");
    } catch (error) {
      message.error("Error!.");
      console.log(error);
    }
  };

  return (
    <>
      <Table
        style={
          borderd
            ? {
                marginTop: 16,
                border: `1px solid ${appColors.colorBorder}`,
                borderRadius: 10,
                overflow: "hidden",
              }
            : { marginTop: 4 }
        }
        columns={columns}
        rowKey={(row) => row.id}
        dataSource={data}
        loading={loading}
        pagination={false}
        size="small"
        footer={() => (
          <div className="table-footer app-flex-space" style={{ position: "relative" }}>
            <div
              className="pattern-isometric pattern-indigo-400 pattern-bg-white 
  pattern-size-6 pattern-opacity-5 absolute inset-0"
              style={{ pointerEvents: "none" }}
            ></div>
            <p
              onClick={handleResultsClick}
              style={{ userSelect: "none", position: "relative", zIndex: 1 }}
            >
              <b>{total}</b> {t("results")}
            </p>
            <Pagination
              simple
              current={page}
              onChange={(_page) => {
                setPage(_page);
              }}
              total={total}
              pageSize={limit}
              showSizeChanger={false}
            />
          </div>
        )}
      />
      <ResultsModal
        open={isResultsModal}
        visit={record}
        onCancel={() => setIsResultsModal(false)}
        onSubmit={handleSaveResult}
      />
      <BarcodeModal
        open={isBarcodeModal}
        onCancel={() => setIsBarcodeModal(false)}
        record={record}
      />
    </>
  );
};
