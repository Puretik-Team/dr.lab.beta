import dayjs from "dayjs";
import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useWhatsappCountStore = create((set) => ({
  whatsappCount: 0,

  setWhatsappCount: (newCount) =>
    set(() => ({
      whatsappCount: newCount,
    })),
}));

export const usePrintCountStore = create((set) => ({
  printCount: { sent: 0, limit: 0 },
  isLimitExceeded: false,

  setPrintCount: (newCount) =>
    set((state) => {
      const updatedCount = {
        ...state.printCount,
        ...newCount,
      };

      return {
        printCount: updatedCount,
        isLimitExceeded: updatedCount.sent >= updatedCount.limit,
      };
    }),
}));

export const useAppStore = create((set) => ({
  isLogin: true,
  user: null,
  isReload: false,
  link: "home",
  isOnline: navigator.onLine,
  printFontSize: parseInt(localStorage.getItem("lab-print-size"), 10) || 10,
  // How often list screens (Patients, Visits, ...) re-fetch from the local
  // DB, so records pulled in by background sync show up without navigating
  // away and back. 0 = off.
  autoRefreshSeconds:
    parseInt(localStorage.getItem("lab-auto-refresh-seconds"), 10) || 1800,
  headerEmpty: localStorage.getItem("lab-header-empty") === "true",
  // null = auto height from the header image's aspect ratio
  headerHeight: localStorage.getItem("lab-header-height")
    ? parseInt(localStorage.getItem("lab-header-height"), 10)
    : null,
  footerEmpty: localStorage.getItem("lab-footer-empty") === "true",
  // null = auto height from the footer image's aspect ratio
  footerHeight: localStorage.getItem("lab-footer-height")
    ? parseInt(localStorage.getItem("lab-footer-height"), 10)
    : null,
  imagePath: null,
  footImagePath: null,
  setImagePath: (imagePath) => set({ imagePath }),
  setIsOnline: (isOnline) => set({ isOnline }),
  setUser: (user) => set({ user }),
  setPrintFontSize: (printFontSize) => set({ printFontSize }),
  setAutoRefreshSeconds: (autoRefreshSeconds) => set({ autoRefreshSeconds }),
  setHeaderEmpty: (headerEmpty) => set({ headerEmpty }),
  setHeaderHeight: (headerHeight) => set({ headerHeight }),
  setFooterEmpty: (footerEmpty) => set({ footerEmpty }),
  setFooterHeight: (footerHeight) => set({ footerHeight }),
  setFootImagePath: (footImagePath) => set({ footImagePath }),
  setLink: (link) => set({ link }),
  setIsReload: (isReload) => set({ isReload }),
  setIsLogin: (isLogin) => set({ isLogin }),
}));

export const useHomeStore = create((set) => ({
  isBarcode: false,
  isModal: false,
  isQuickActionsModal: false,
  isResultsModal: false,
  isToday: true,
  testType: null,
  selectedTest: null,
  querySearch: "",
  id: null,
  uID: nanoid(),
  createdAt: null,
  tests: [],
  discount: null,
  status: "PENDING",
  //patient info
  patientID: null,
  name: "",
  birth: "",
  phone: "",
  email: "",
  gender: null,
  record: null,
  patientRow: {},
  doctorRow: {},
  setPatientRow: (patientRow) => set({ patientRow }),
  setDoctorRow: (doctorRow) => set({ doctorRow }),
  setPatientID: (patientID) => set({ patientID }),
  setIsToday: (isToday) => set({ isToday }),
  setIsBarcode: (isBarcode) => set({ isBarcode }),
  setRecord: (record) => set({ record }),
  setUID: (uID) => set({ uID }),
  setName: (name) => set({ name }),
  setBirth: (birth) => set({ birth }),
  setPhone: (phone) => set({ phone }),
  setEmail: (email) => set({ email }),
  setGender: (gender) => set({ gender }),
  setTests: (tests) => set({ tests }),
  setDiscount: (discount) => set({ discount }),
  setCreatedAt: (createdAt) => set({ createdAt }),
  setTestType: (testType) => set({ testType }),
  setSelectedTest: (selectedTest) => set({ selectedTest }),
  setId: (id) => set({ id }),
  setIsModal: (isModal) => set({ isModal }),
  setIsResultsModal: (isResultsModal) => set({ isResultsModal }),
  setIsQuickActionsModal: (isQuickActionsModal) => set({ isQuickActionsModal }),
  setStatus: (status) => set({ status }),
  setQuerySearch: (querySearch) => set({ querySearch }),
  setReset: () =>
    set({
      isQuickActionsModal: false,
      id: null,
      patientID: null,
      testType: null,
      selectedTest: null,
      createdAt: null,
      tests: [],
      discount: null,
      status: "PENDING",
      name: "",
      birth: "",
      phone: "",
      email: "",
      gender: null,
      record: null,
    }),
}));

export const useTestStore = create((set) => ({
  isModal: false,
  querySearch: "",
  testType: null,
  type: "single",
  groupTest: "[]",
  id: null,
  name: "",
  normal: null,
  price: "",
  createdAt: null,
  isSelecte: false,
  options: ["positive", "negative"],
  initialData: null,
  setInitialData: (initialData) => set({ initialData }),
  setType: (type) => set({ type }),
  setGroupTest: (groupTest) => set({ groupTest }),
  setId: (id) => set({ id }),
  setName: (name) => set({ name }),
  setNormal: (normal) => set({ normal }),
  setPrice: (price) => set({ price }),
  setIsModal: (isModal) => set({ isModal }),
  setCreatedAt: (createdAt) => set({ createdAt }),
  setQuerySearch: (querySearch) => set({ querySearch }),
  setIsSelecte: (isSelecte) => set({ isSelecte }),
  setOptions: (options) => set({ options }),
  setReset: () =>
    set({
      id: null,
      name: "",
      normal: null,
      price: "",
      createdAt: null,
      isSelecte: false,
      options: ["positive", "negative"],
      type: "single",
      groupTest: "[]",
    }),
}));

export const usePatientStore = create((set) => ({
  querySearch: "",
  isModal: false,
  name: "",
  birth: "",
  phone: "",
  email: "",
  gender: null,
  createdAt: null,
  isHistory: false,
  id: null,
  uID: nanoid(),
  setIsHistory: (isHistory) => set({ isHistory }),
  setId: (id) => set({ id }),
  setUID: (uID) => set({ uID }),
  setName: (name) => set({ name }),
  setBirth: (birth) => set({ birth }),
  setPhone: (phone) => set({ phone }),
  setEmail: (email) => set({ email }),
  setGender: (gender) => set({ gender }),
  setIsModal: (isModal) => set({ isModal }),
  setCreatedAt: (createdAt) => set({ createdAt }),
  setQuerySearch: (querySearch) => set({ querySearch }),
  setReset: () =>
    set({
      id: null,
      createdAt: null,
      name: "",
      birth: "",
      phone: "",
      email: "",
      gender: null,
      uID: nanoid(),
    }),
}));

export const useDoctorStore = create((set) => ({
  querySearch: "",
  isModal: false,
  name: "",
  birth: "",
  phone: "",
  email: "",
  address: "",
  type: "",
  gender: null,
  createdAt: null,
  id: null,
  uID: nanoid(),
  isHistory: false,
  doctor_fee: 0,
  note: "",
  filterDate: [dayjs(), dayjs()],
  setDoctorFee: (doctor_fee) => set({ doctor_fee }),
  setNote: (note) => set({ note }),
  setFilterDate: (date) => set({ filterDate: date }),
  setIsHistory: (isHistory) => set({ isHistory }),
  setId: (id) => set({ id }),
  setUID: (uID) => set({ uID }),
  setName: (name) => set({ name }),
  setBirth: (birth) => set({ birth }),
  setPhone: (phone) => set({ phone }),
  setAddress: (address) => set({ address }),
  setType: (type) => set({ type }),
  setEmail: (email) => set({ email }),
  setGender: (gender) => set({ gender }),
  setIsModal: (isModal) => set({ isModal }),
  setCreatedAt: (createdAt) => set({ createdAt }),
  setQuerySearch: (querySearch) => set({ querySearch }),
  setReset: () =>
    set({
      id: null,
      createdAt: null,
      name: "",
      birth: "",
      phone: "",
      email: "",
      address: "",
      type: "",
      gender: null,
      uID: nanoid(),
    }),
}));

export const useGroupStore = create((set) => ({
  isModal: false,
  title: "",
  id: null,
  tests: [],
  customePrice: null,
  createdAt: null,
  querySearch: "",
  setIsModal: (isModal) => set({ isModal }),
  setId: (id) => set({ id }),
  setCreatedAt: (createdAt) => set({ createdAt }),
  setQuerySearch: (querySearch) => set({ querySearch }),
  setTitle: (title) => set({ title }),
  setTests: (tests) => set({ tests }),
  setCustomePrice: (customePrice) => set({ customePrice }),
  setReset: () =>
    set({
      id: null,
      title: "",
      customePrice: null,
      tests: [],
      createdAt: null,
    }),
}));

export const useReportsStore = create((set) => ({
  filterDate: [dayjs(), dayjs()],
  data: null,
  loading: false,
  records: [],
  subTotalPrice: 0, // Add state for subtotal price
  totalDiscount: 0, // Add state for total discount
  totalAmount: 0, // Add state for total amount
  visitStatus: null,
  setVisitStatus: (visitStatus) => set({ visitStatus }),
  setRecords: (records) => set({ records }),
  setLoading: (loading) => set({ loading }),
  setFilterDate: (date) => set({ filterDate: date }),
  setData: (data) => set({ data }),
  setSubTotalPrice: (price) => set({ subTotalPrice: price }), // Add setter for subtotal price
  setTotalDiscount: (discount) => set({ totalDiscount: discount }), // Add setter for total discount
  setTotalAmount: (amount) => set({ totalAmount: amount }), // Add setter for total amount
}));

export const useLanguage = create(
  persist(
    (set) => ({
      lang: "en",
      setLang: (lang) => set({ lang }),
    }),
    {
      name: "lang",
    }
  )
);

import { create } from "zustand";
import { theme } from "antd";

export const useTrigger = create((set) => ({
  flag: false,
  test: [],
  setFlag: (flag) => set({ flag }),
  setTest: (test) => set({ test }),
}));
