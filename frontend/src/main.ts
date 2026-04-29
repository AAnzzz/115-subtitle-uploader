import { createApp } from "vue";
import {
  ElAlert,
  ElBreadcrumb,
  ElBreadcrumbItem,
  ElButton,
  ElCard,
  ElCol,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElPagination,
  ElProgress,
  ElRow,
  ElTable,
  ElTableColumn,
  vLoading
} from "element-plus";
import "element-plus/theme-chalk/dark/css-vars.css";
import "element-plus/es/components/alert/style/css";
import "element-plus/es/components/breadcrumb/style/css";
import "element-plus/es/components/breadcrumb-item/style/css";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/card/style/css";
import "element-plus/es/components/col/style/css";
import "element-plus/es/components/descriptions/style/css";
import "element-plus/es/components/descriptions-item/style/css";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/drawer/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/form-item/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/loading/style/css";
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/message-box/style/css";
import "element-plus/es/components/pagination/style/css";
import "element-plus/es/components/progress/style/css";
import "element-plus/es/components/row/style/css";
import "element-plus/es/components/table/style/css";
import "element-plus/es/components/table-column/style/css";
import App from "./App.vue";
import "./style.css";

const app = createApp(App);

app.component("ElAlert", ElAlert);
app.component("ElBreadcrumb", ElBreadcrumb);
app.component("ElBreadcrumbItem", ElBreadcrumbItem);
app.component("ElButton", ElButton);
app.component("ElCard", ElCard);
app.component("ElCol", ElCol);
app.component("ElDescriptions", ElDescriptions);
app.component("ElDescriptionsItem", ElDescriptionsItem);
app.component("ElDialog", ElDialog);
app.component("ElDrawer", ElDrawer);
app.component("ElForm", ElForm);
app.component("ElFormItem", ElFormItem);
app.component("ElInput", ElInput);
app.component("ElPagination", ElPagination);
app.component("ElProgress", ElProgress);
app.component("ElRow", ElRow);
app.component("ElTable", ElTable);
app.component("ElTableColumn", ElTableColumn);
app.directive("loading", vLoading);
app.config.globalProperties.$message = ElMessage;
app.config.globalProperties.$msgbox = ElMessageBox;
app.config.globalProperties.$confirm = ElMessageBox.confirm;
app.config.globalProperties.$alert = ElMessageBox.alert;
app.config.globalProperties.$prompt = ElMessageBox.prompt;

app.mount("#app");

