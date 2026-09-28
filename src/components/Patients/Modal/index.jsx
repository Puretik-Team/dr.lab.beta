import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Modal,
  Radio,
  Row,
  Space,
  Typography,
  message,
} from "antd";
import { useAppStore, usePatientStore } from "../../../libs/appStore";
import "./style.css";
import { send } from "../../../control/renderer";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import AgeInput from "../../Global/AgeInput";
import { isValidMobilePhoneNumber } from "../../../helper/phoneValidation";
import { isValidEmail } from "../../../helper/emailValidation";

const { Text } = Typography;

export const PureModal = () => {
  const { setIsReload, isReload } = useAppStore();
  const {
    id,
    name,
    birth,
    phone,
    email,
    gender,
    setName,
    setBirth,
    setPhone,
    setEmail,
    setGender,
    isModal,
    setIsModal,
    setReset,
  } = usePatientStore();
  const { t } = useTranslation();

  const handleSubmit = () => {
    if (phone?.trim() && !isValidMobilePhoneNumber(phone)) {
      message.error(t("InvalidPhoneNumberFormat"));
      return;
    }

    if (email?.trim() && !isValidEmail(email)) {
      message.error(t("InvalidEmailFormat"));
      return;
    }

    let data = {
      name,
      gender,
      email,
      phone,
      birth: birth.toString(),
    };

    if (id) {
      send({
        query: "updatePatient",
        id,
        data: { ...data },
      })
        .then((resp) => {
          if (resp.success) {
            message.success(t("Patientupdatedsuccessfully"));
            setReset();
            setIsModal(false);
            setIsReload(!isReload);
          } else {
            console.error("Error updating patient:", resp.error);
            message.error(t("Failedtoupdatepatient"));
          }
        })
        .catch((err) => {
          console.error("Error in IPC communication:", err);
          message.error("Failed to communicate with server.");
        });
    } else {
      send({
        query: "addPatient",
        data: { ...data, createdAt: Date.now() },
      })
        .then((resp) => {
          if (resp.success) {
            message.success(t("Patientaddedsuccessfully"));
            setReset();
            setIsModal(false);
            setIsReload(!isReload);
          } else {
            console.error("Error adding patient:", resp.error);
            message.error(t("Failedtoaddpatient"));
          }
        })
        .catch((err) => {
          console.error("Error in IPC communication:", err);
          message.error("Failed to communicate with server.");
        });
    }
  };

  return (
    <Modal
      title={`${id ? t("Edit") : t("Add")} ${t("NewPatient")}`}
      open={isModal}
      width={400}
      onOk={() => {
        setIsModal(false);
      }}
      onCancel={() => {
        setIsModal(false);
      }}
      footer={
        <Space>
          <Button
            onClick={() => {
              setIsModal(false);
            }}
          >
            {t("Close")}
          </Button>
          <Button
            disabled={!name || !gender || !birth}
            type="primary"
            onClick={handleSubmit}
          >
            {t("Save")}
          </Button>
        </Space>
      }
      centered
    >
      <div className="create-patient-modal">
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Space style={{ width: "100%" }} direction="vertical" size={4}>
              <Text>{t("PatientName")}</Text>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("ExName")}
              />
            </Space>
          </Col>
          <Col span={10}>
            <Space style={{ width: "100%" }} direction="vertical" size={4}>
              <Text>{t("Age")}</Text>
              <AgeInput birth={birth} onChange={setBirth} placeholder={t("EnterAge")} />
              {/* <DatePicker
                picker={t("year")}
                value={birth}
                onChange={(val) => setBirth(val)}
                style={{ width: "100%" }}
              /> */}
            </Space>
          </Col>
          <Col span={14}>
            <Space style={{ width: "100%" }} direction="vertical" size={4}>
              <Text>{t("PhoneNumber")}</Text>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07xxxxxxxxx"
                style={{ width: "100%" }}
              />
            </Space>
          </Col>
          <Col span={16}>
            <Space style={{ width: "100%" }} direction="vertical" size={4}>
              <Text>
                {t("Email")} <Text type="secondary">{t("Optional")}</Text>
              </Text>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex: mail@example.com"
                style={{ width: "100%" }}
              />
            </Space>
          </Col>
          <Col span={24}>
            <Space style={{ width: "100%" }} direction="vertical" size={0}>
              <Text>{t("Gender")}</Text>
              <Radio.Group
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <Space>
                  <Card hoverable bodyStyle={{ padding: 8 }}>
                    <Radio value={"male"}> {t("Male")}</Radio>
                  </Card>
                  <Card hoverable bodyStyle={{ padding: 8 }}>
                    <Radio value={"female"}>{t("Female")}</Radio>
                  </Card>
                </Space>
              </Radio.Group>
            </Space>
          </Col>
        </Row>
      </div>
    </Modal>
  );
};

export const PatientModal = PureModal;
