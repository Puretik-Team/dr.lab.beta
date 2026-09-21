import React, { useEffect, useState } from "react";
import "./style.css";
import { Button, Card, Divider, InputNumber, message, Select, Spin, Switch } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";

import fileDialog from "file-dialog";
import { send } from "../../control/renderer";
import { useAppStore } from "../../libs/appStore";
import { useTranslation } from "react-i18next";

import useInitHeaderImage from "../../hooks/useInitHeaderImage";
import HeaderSizePreview from "./HeaderSizePreview";

const { webUtils } = window.require("electron");

export const PDFSettings = () => {
  const [imagePathLoading, setImagePathLoading] = useState(false);
  const [sizePreviewOpen, setSizePreviewOpen] = useState(false);
  const [footImageLoading, setFootImageLoading] = useState(false);
  const [footerPreviewOpen, setFooterPreviewOpen] = useState(false);

  const {
    user,
    setPrintFontSize,
    printFontSize,
    imagePath,
    setImagePath,
    headerEmpty,
    setHeaderEmpty,
    headerHeight,
    setHeaderHeight,
    footerEmpty,
    setFooterEmpty,
    footerHeight,
    setFooterHeight,
    footImagePath,
    setFootImagePath,
  } = useAppStore();

  const { fetchHeader } = useInitHeaderImage();

  const { t } = useTranslation();

  const handleSizeChange = (val) => {
    localStorage.setItem("lab-print-size", val);
    setPrintFontSize(val);
  };

  const handleHeaderEmptyChange = (checked) => {
    localStorage.setItem("lab-header-empty", checked ? "true" : "false");
    setHeaderEmpty(checked);
  };

  const handleHeaderHeightChange = (val) => {
    if (val === null || val === undefined) {
      localStorage.removeItem("lab-header-height");
      setHeaderHeight(null);
    } else {
      localStorage.setItem("lab-header-height", val);
      setHeaderHeight(val);
    }
  };

  const handleFooterEmptyChange = (checked) => {
    localStorage.setItem("lab-footer-empty", checked ? "true" : "false");
    setFooterEmpty(checked);
  };

  const handleFooterHeightChange = (val) => {
    if (val === null || val === undefined) {
      localStorage.removeItem("lab-footer-height");
      setFooterHeight(null);
    } else {
      localStorage.setItem("lab-footer-height", val);
      setFooterHeight(val);
    }
  };

  // foot.png is optional (no default), so a 404 just means "no footer image"
  const loadFootImage = async () => {
    try {
      const res = await fetch(`http://localhost:3009/foot.png?t=${Date.now()}`);
      setFootImagePath(res.ok ? res.url : null);
    } catch (err) {
      setFootImagePath(null);
    }
  };

  useEffect(() => {
    loadFootImage();
  }, []);

  const handleChangeFootFile = async () => {
    try {
      const files = await fileDialog();
      if (!files || files.length === 0) return;

      const selectedFile = files[0];
      const fileName = selectedFile.name.toLowerCase();
      const validExtensions = [".png", ".jpg", ".jpeg", ".webp"];
      if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
        message.error(t("PleaseSelectImageFile"));
        return;
      }

      setFootImageLoading(true);
      const saveResponse = await send({
        query: "saveFootImage",
        file: webUtils.getPathForFile(selectedFile),
      });
      if (!saveResponse.success) throw new Error(saveResponse.error);

      await loadFootImage();
      message.success(t("ImageUploadedSuccessfully"));
    } catch (error) {
      console.error("Error uploading footer image:", error);
      message.error(t("ErrorUploadingImage"));
    } finally {
      setFootImageLoading(false);
    }
  };

  const handleRemoveFootImage = async () => {
    setFootImageLoading(true);
    await send({ query: "removeFootImage" });
    await loadFootImage();
    setFootImageLoading(false);
  };

  const handleChangeFile = async () => {
    try {
      const files = await fileDialog();
      if (!files || files.length === 0) return;

      const selectedFile = files[0];
      const fileName = selectedFile.name.toLowerCase();

      const validExtensions = [".png", ".jpg", ".jpeg", ".webp"];
      const isImageFile = validExtensions.some((ext) => fileName.endsWith(ext));

      if (!isImageFile) {
        message.error(t("PleaseSelectImageFile"));
        return;
      }

      setImagePathLoading(true);
      const filePath = webUtils.getPathForFile(selectedFile);
      const saveResponse = await send({
        query: "saveHeadImage",
        file: filePath,
      });

      if (saveResponse.success) {
        setImagePathLoading(true);
        setImagePath(null);
        await fetchHeader();
        setImagePathLoading(false);
        message.success(t("ImageUploadedSuccessfully"));
      } else {
        throw new Error(saveResponse.error);
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      message.error(t("ErrorUploadingImage"));
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center">
        <b className="text-[14px]">{t("ImageCover")}</b>
        <Button type="link" onClick={handleChangeFile}>
          {t("ChangeImage")}
        </Button>
      </div>
      <div
        className={`w-full border border-[#eee] rounded-md overflow-hidden bg-[#f6f6f6] ${
          imagePath ? "" : "min-h-[80px]"
        }`}
      >
        {imagePath ? (
          <Spin spinning={imagePathLoading}>
            <img className="w-full block" key={imagePath} src={imagePath} />
          </Spin>
        ) : (
          <></>
        )}
      </div>
      <Divider />
      <div className="flex gap-2 items-center">
        <b className="text-[12px]">{t("FontSize")}</b>
        <Select
          value={printFontSize}
          variant="borderless"
          onChange={handleSizeChange}
          popupMatchSelectWidth={false}
          style={{ width: 100, textAlign: "center" }}
          size="small"
        >
          <Select.Option value={6}>{t("Extra Small")}</Select.Option>
          <Select.Option value={8}>{t("Small")}</Select.Option>
          <Select.Option value={10}>{t("Medium")}</Select.Option>
          <Select.Option value={12}>{t("Large")}</Select.Option>
          <Select.Option value={14}>{t("Extra Large")}</Select.Option>
        </Select>
      </div>
      <Divider />
      <div className="flex justify-between items-center">
        <b className="text-[12px]">{t("EmptyHeader")}</b>
        <Switch checked={headerEmpty} onChange={handleHeaderEmptyChange} />
      </div>
      <div className="flex gap-2 items-center mt-2">
        <b className="text-[12px]">{t("HeaderHeight")}</b>
        <InputNumber
          value={headerHeight}
          onChange={handleHeaderHeightChange}
          placeholder={t("Auto")}
          min={5}
          max={120}
          addonAfter="mm"
          size="small"
          style={{ width: 130 }}
        />
        <Button
          type="text"
          size="small"
          icon={<QuestionCircleOutlined />}
          onClick={() => setSizePreviewOpen(true)}
        >
          {t("Preview")}
        </Button>
      </div>

      <HeaderSizePreview
        open={sizePreviewOpen}
        onClose={() => setSizePreviewOpen(false)}
        headerEmpty={headerEmpty}
        headerHeight={headerHeight}
        onChangeHeight={handleHeaderHeightChange}
      />

      <Divider />
      <div className="flex justify-between items-center">
        <b className="text-[14px]">{t("FooterImage")}</b>
        <div>
          {footImagePath && (
            <Button type="link" danger onClick={handleRemoveFootImage}>
              {t("RemoveImage")}
            </Button>
          )}
          <Button type="link" onClick={handleChangeFootFile}>
            {t("ChangeImage")}
          </Button>
        </div>
      </div>
      <div
        className={`w-full border border-[#eee] rounded-md overflow-hidden bg-[#f6f6f6] ${
          footImagePath ? "" : "min-h-[50px] flex items-center justify-center"
        }`}
      >
        <Spin spinning={footImageLoading}>
          {footImagePath ? (
            <img className="w-full block" key={footImagePath} src={footImagePath} />
          ) : (
            <span className="text-[12px] text-[#aaa]">{t("NoFooterImage")}</span>
          )}
        </Spin>
      </div>
      <div className="flex justify-between items-center mt-3">
        <b className="text-[12px]">{t("EmptyFooter")}</b>
        <Switch checked={footerEmpty} onChange={handleFooterEmptyChange} />
      </div>
      <div className="flex gap-2 items-center mt-2">
        <b className="text-[12px]">{t("FooterHeight")}</b>
        <InputNumber
          value={footerHeight}
          onChange={handleFooterHeightChange}
          placeholder={t("Auto")}
          min={5}
          max={120}
          addonAfter="mm"
          size="small"
          style={{ width: 130 }}
        />
        <Button
          type="text"
          size="small"
          icon={<QuestionCircleOutlined />}
          onClick={() => setFooterPreviewOpen(true)}
        >
          {t("Preview")}
        </Button>
      </div>

      <HeaderSizePreview
        kind="Footer"
        open={footerPreviewOpen}
        onClose={() => setFooterPreviewOpen(false)}
        headerEmpty={footerEmpty}
        headerHeight={footerHeight}
        onChangeHeight={handleFooterHeightChange}
      />
    </div>
  );
};
