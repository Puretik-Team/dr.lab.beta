import {
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Typography,
} from "antd";
import { RxReset } from "react-icons/rx";
import { useHomeStore } from "../../../libs/appStore";
import { useEffect, useState } from "react";
import { send } from "../../../control/renderer";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import AgeInput from "../../Global/AgeInput";

const { Text } = Typography;

const PatientForm = () => {
  const { isModal, setPatientRow, patientRow, id } = useHomeStore();
  const [patientsList, setPatientsList] = useState([]);
  const [selected, setSelected] = useState(null);
  const { t } = useTranslation();

  const getPtients = (querySearch = "") => {
    send({
      query: "getPatients",
      q: querySearch,
      skip: 0,
      limit: 10,
    })
      .then((resp) => {
        if (resp.success) {
          setPatientsList(resp.data);
        } else {
          console.error("Error fetching patients:", resp.error);
        }
      })
      .catch((err) => {
        console.error("Error in IPC communication:", err);
      });
  };

  useEffect(() => {
    isModal && getPtients();
  }, [isModal]);

  useEffect(() => {
    if (!selected) return;
    let patientObj = patientsList.find((el) => el?.id === selected);
    setPatientRow({ ...patientObj, birth: dayjs(patientObj?.birth) });
  }, [selected]);

  const handleChangeInput = (e, customName) => {
    if (customName) {
      setPatientRow({ ...patientRow, [customName]: e });
      return;
    }
    let { name, value } = e.target;
    setPatientRow({ ...patientRow, [name]: value });
  };

  return (
    <div className="user-form">
      <Select
        showSearch
        disabled={id}
        placeholder={t("SelectPatient")}
        optionFilterProp="children"
        style={{ width: "100%" }}
        onSearch={getPtients}
        onSelect={setSelected}
        allowClear
        filterOption={(input, option) =>
          (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
        }
        options={patientsList?.map((el) => {
          return {
            label: el?.name,
            value: el?.id,
          };
        })}
      />
      <Divider />
      <Row gutter={[16, 16]} className="frutiger-font">
        <Col span={24}>
          <Space style={{ width: "100%" }} direction="vertical" size={4}>
            <Text>{t("PatientName")}</Text>
            <Input
              value={patientRow?.name}
              name={"name"}
              onChange={handleChangeInput}
              placeholder={t("ExName")}
            />
          </Space>
        </Col>
        <Col span={10}>
          <Space style={{ width: "100%" }} direction="vertical" size={4}>
            <Text>{t("Age")}</Text>
            <AgeInput
              birth={patientRow?.birth}
              onChange={(birth) => setPatientRow({ ...patientRow, birth })}
              placeholder={t("EnterAge")}
            />
            {/* <DatePicker
              picker={t("year")}
              value={patientRow?.birth}
              name={"birth"}
              onChange={(val) => handleChangeInput(val, "birth")}
              style={{ width: "100%" }}
            /> */}
          </Space>
        </Col>
        <Col span={14}>
          <Space style={{ width: "100%" }} direction="vertical" size={4}>
            <Text>{t("PhoneNumber")}</Text>
            <Input
              value={patientRow?.phone}
              name={"phone"}
              onChange={handleChangeInput}
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
              value={patientRow?.email}
              name={"email"}
              onChange={handleChangeInput}
              placeholder="Ex: mail@example.com"
              style={{ width: "100%" }}
            />
          </Space>
        </Col>
        <Col span={24}>
          <Space style={{ width: "100%" }} direction="vertical" size={0}>
            <Text>{t("Gender")}</Text>
            <Radio.Group
              value={patientRow?.gender}
              name={"gender"}
              onChange={handleChangeInput}
            >
              <Space>
                <Card hoverable bodyStyle={{ padding: 8 }}>
                  <Radio value={"male"}>{t("Male")}</Radio>
                </Card>
                <Card hoverable bodyStyle={{ padding: 8 }}>
                  <Radio value={"female"}>{t("Female")}</Radio>
                </Card>
              </Space>
            </Radio.Group>
          </Space>
        </Col>
        <Col span={24}>
          <Button
            onClick={() => {
              setPatientRow({});
              setSelected(null);
            }}
            icon={<RxReset />}
            type="link"
          >
            Reset Fields
          </Button>
        </Col>
      </Row>
    </div>
  );
};

export default PatientForm;
