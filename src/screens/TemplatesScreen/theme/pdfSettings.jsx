import React, { useEffect, useState } from "react";
import { Button, message, Select, Spin } from "antd";
import { CheckOutlined } from "@ant-design/icons";

import fileDialog from "file-dialog";
import { send } from "../../../control/renderer";
import { useAppStore } from "../../../libs/appStore";
import { useTranslation } from "react-i18next";

import useInitHeaderImage from "../../../hooks/useInitHeaderImage";

const { webUtils } = window.require("electron");

// Must match PDF_CFG.brand.purpleTint/purpleDeep in src/control/pdf/config.js
// — the report's built-in default when the lab hasn't picked a custom color.
const DEFAULT_TABLE_HEADER_COLOR = "#F5F1FC";
const DEFAULT_TABLE_HEADER_TEXT_COLOR = "#4E3894";

// Fixed set of {background, text} pairs — every label and the accent line
// under the header use `text`, so it's always a readable, matching theme
// rather than just a background swap. First one is the default.
const TABLE_HEADER_COLOR_PRESETS = [
  { bg: DEFAULT_TABLE_HEADER_COLOR, text: DEFAULT_TABLE_HEADER_TEXT_COLOR }, // Purple (default)
  { bg: "#E8F0FE", text: "#1D4ED8" }, // Blue
  { bg: "#E6F7EC", text: "#1E7A4C" }, // Green
  { bg: "#FDF3E3", text: "#B4540A" }, // Amber
  { bg: "#FCEAF0", text: "#B42318" }, // Rose
  { bg: "#EFEFEF", text: "#404040" }, // Gray
];

// The classic "theme": your own header/footer images plus print options.
// `section` renders one part at a time so the Report Design screen can show
// them as separate steps: "header" | "footer" | "options".
export const PDFSettings = ({ section }) => {
  const [imagePathLoading, setImagePathLoading] = useState(false);
  const [footImageLoading, setFootImageLoading] = useState(false);

  const {
    setPrintFontSize,
    printFontSize,
    imagePath,
    setImagePath,
    footImagePath,
    setFootImagePath,
    tableHeaderColor,
    setTableHeaderColor,
    tableHeaderTextColor,
    setTableHeaderTextColor,
  } = useAppStore();

  const { fetchHeader } = useInitHeaderImage();

  const { t } = useTranslation();

  const handleSizeChange = (val) => {
    localStorage.setItem("lab-print-size", val);
    setPrintFontSize(val);
  };

  const handleTableHeaderColorChange = ({ bg, text }) => {
    if (bg === DEFAULT_TABLE_HEADER_COLOR) {
      localStorage.removeItem("lab-table-header-color");
      localStorage.removeItem("lab-table-header-text-color");
      setTableHeaderColor(null);
      setTableHeaderTextColor(null);
    } else {
      localStorage.setItem("lab-table-header-color", bg);
      localStorage.setItem("lab-table-header-text-color", text);
      setTableHeaderColor(bg);
      setTableHeaderTextColor(text);
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

  if (section === "header")
    return (
      <div>
      <div className="flex justify-between items-center mb-3">
        <b className="text-[16px]">{t("ImageCover")}</b>
        <Button type="primary" size="large" onClick={handleChangeFile}>
          {t("ChangeImage")}
        </Button>
      </div>
      <div
        className={`w-full border border-[#eee] rounded-md overflow-hidden bg-[#f6f6f6] ${
          imagePath ? "" : "min-h-[140px]"
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
      </div>
    );
  if (section === "footer")
    return (
      <div>
      <div className="flex justify-between items-center mb-3">
        <b className="text-[16px]">{t("FooterImage")}</b>
        <div>
          {footImagePath && (
            <Button size="large" danger type="text" onClick={handleRemoveFootImage}>
              {t("RemoveImage")}
            </Button>
          )}
          <Button type="primary" size="large" onClick={handleChangeFootFile}>
            {t("ChangeImage")}
          </Button>
        </div>
      </div>
      <div
        className={`w-full border border-[#eee] rounded-md overflow-hidden bg-[#f6f6f6] ${
          footImagePath ? "" : "min-h-[100px] flex items-center justify-center"
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
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
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
      <div className="flex justify-between items-center">
        <b className="text-[12px]">{t("TableHeaderColor")}</b>
        <div className="flex items-center gap-2">
          {TABLE_HEADER_COLOR_PRESETS.map(({ bg, text }) => {
            const isActive = (tableHeaderColor || DEFAULT_TABLE_HEADER_COLOR) === bg;
            return (
              <button
                key={bg}
                type="button"
                title={bg}
                onClick={() => handleTableHeaderColorChange({ bg, text })}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: bg,
                  border: isActive ? `2px solid ${text}` : "1px solid #d9d9d9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {isActive && <CheckOutlined style={{ fontSize: 10, color: text }} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
