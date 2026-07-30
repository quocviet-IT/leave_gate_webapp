import { Fragment } from "react";
import HoursLine from "@/components/public/HoursLine";
import NamePicker from "@/components/public/NamePicker";
import SubmitForm, { ActionFieldError } from "@/components/public/SubmitForm";
import {
  lastStepFor,
  validateStep,
  type FormStep,
  type RequestKind,
} from "@/lib/domain/form-steps";

export const metadata = { title: "Gửi đơn - Nhân sự CTYHP" };

type SearchParams = Record<string, string | string[] | undefined>;
type Values = Record<string, string>;

const LEAVE_REASONS = [
  ["unpaid", "Nghỉ không lương"],
  ["annual", "Phép năm"],
  ["sick", "Ốm đau"],
  ["marriage", "Kết hôn"],
  ["maternity", "Thai sản"],
  ["bereavement", "Tang chế"],
  ["special", "Trường hợp đặc biệt"],
  ["other", "Khác"],
] as const;

const GATE_REASONS = [
  ["business_trip", "Đi công tác"],
  ["leave", "Nghỉ phép"],
  ["other", "Khác"],
] as const;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function valuesOf(params: SearchParams): Values {
  const values: Values = {};
  for (const [key, value] of Object.entries(params)) values[key] = one(value);
  return values;
}

function kindOf(value: string): RequestKind {
  return value === "gate" ? "gate" : "leave";
}

function requestedStep(value: string): FormStep {
  return value === "2" ? 2 : value === "3" ? 3 : 1;
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="field-error" role="alert">
      {message}
    </p>
  ) : null;
}

function StepHeader({ step, kind }: { step: FormStep; kind: RequestKind }) {
  const totalSteps = lastStepFor(kind);
  return (
    <header className="form-heading">
      <span className="step-kicker">
        Bước {step}
        {step > 1 ? ` / ${totalSteps}` : ""}
      </span>
      <h1>
        {step === 1
          ? "Gửi đơn nghỉ phép hoặc ra vào cổng"
          : kind === "leave"
            ? "Gửi đơn xin nghỉ phép"
            : "Gửi giấy ra vào cổng"}
      </h1>
      <p>Không cần đăng nhập. Mỗi bước chỉ hỏi những thông tin cần thiết.</p>
      <ol
        className="step-track"
        style={{ gridTemplateColumns: `repeat(${step === 1 ? 3 : totalSteps}, minmax(0, 1fr))` }}
        aria-label="Tiến trình gửi đơn"
      >
        {Array.from({ length: step === 1 ? 3 : totalSteps }, (_, index) => index + 1).map((number) => (
          <li key={number} aria-current={number === step ? "step" : undefined}>
            <span>{number}</span>
          </li>
        ))}
      </ol>
    </header>
  );
}

function IdentityFields({ values }: { values: Values }) {
  return (
    <>
      <input name="kind" type="hidden" value={kindOf(values.kind)} />
      <input name="employeeId" type="hidden" value={values.employeeId ?? ""} />
      <input name="employeeName" type="hidden" value={values.employeeName ?? ""} />
      <input name="employeeTitle" type="hidden" value={values.employeeTitle ?? ""} />
      <input
        name="employeeDepartment"
        type="hidden"
        value={values.employeeDepartment ?? ""}
      />
    </>
  );
}

function IdentitySummary({ values }: { values: Values }) {
  const details = [values.employeeTitle, values.employeeDepartment].filter(Boolean).join(" | ");
  return (
    <div className="identity-summary">
      <span>Người gửi</span>
      <strong>{values.employeeName || "Tên đã chọn ở bước trước"}</strong>
      {details ? <small>{details}</small> : null}
    </div>
  );
}

function StepOne({ kind, errors }: { kind: RequestKind; errors: Record<string, string> }) {
  return (
    <>
      <StepHeader step={1} kind={kind} />
      <form className="request-form" action="/don" method="get">
        <input name="buoc" type="hidden" value="2" />
        <fieldset className="form-field">
          <legend>Loại đơn</legend>
          <div className="choice-grid">
            <label className="choice">
              <input name="kind" type="radio" value="leave" defaultChecked={kind === "leave"} />
              <span>
                <strong>Xin nghỉ phép</strong>
                <small>Nghỉ cả ngày hoặc nửa ngày</small>
              </span>
            </label>
            <label className="choice">
              <input name="kind" type="radio" value="gate" defaultChecked={kind === "gate"} />
              <span>
                <strong>Ra vào cổng</strong>
                <small>Rời công ty rồi vào lại</small>
              </span>
            </label>
          </div>
          <FieldError message={errors.kind} />
        </fieldset>

        <NamePicker
          fieldName="employeeId"
          label="Tôi tên là"
          error={errors.employeeId}
          includeProfileFields
        />

        <div className="form-actions form-actions--end">
          <button className="button button--primary" type="submit">
            Tiếp tục
          </button>
        </div>
      </form>
    </>
  );
}

function LeaveFields({
  values,
  errors,
  actionErrors = false,
}: {
  values: Values;
  errors: Record<string, string>;
  actionErrors?: boolean;
}) {
  const error = (field: string) =>
    actionErrors ? <ActionFieldError field={field} /> : <FieldError message={errors[field]} />;

  return (
    <>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="fromDate">Nghỉ từ ngày</label>
          <input
            id="fromDate"
            className="field-control"
            name="fromDate"
            type="date"
            defaultValue={values.fromDate}
          />
          {error("fromDate")}
        </div>
        <div className="form-field">
          <label htmlFor="toDate">Đến hết ngày</label>
          <input
            id="toDate"
            className="field-control"
            name="toDate"
            type="date"
            defaultValue={values.toDate}
          />
          {error("toDate")}
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="halfDay">Thời lượng</label>
        <select
          id="halfDay"
          className="field-control"
          name="halfDay"
          defaultValue={values.halfDay}
        >
          <option value="">Cả ngày</option>
          <option value="morning">Nửa ngày buổi sáng</option>
          <option value="afternoon">Nửa ngày buổi chiều</option>
        </select>
        <span className="field-help">Nửa ngày chỉ chọn được khi ngày bắt đầu và kết thúc giống nhau.</span>
        {error("halfDay")}
      </div>

      <div className="form-field">
        <label htmlFor="reason">Lý do nghỉ</label>
        <select
          id="reason"
          className="field-control"
          name="reason"
          defaultValue={values.reason}
        >
          <option value="">Chọn lý do</option>
          {LEAVE_REASONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {error("reason")}
      </div>

      <div className="form-field">
        <label htmlFor="reasonText">Ghi rõ lý do đặc biệt hoặc lý do khác</label>
        <input
          id="reasonText"
          className="field-control"
          name="reasonText"
          type="text"
          maxLength={500}
          defaultValue={values.reasonText}
          placeholder="Chỉ bắt buộc khi chọn Trường hợp đặc biệt hoặc Khác"
        />
        {error("reasonText")}
      </div>

      <div className="form-field">
        <label htmlFor="note">Diễn giải</label>
        <textarea
          id="note"
          className="field-control"
          name="note"
          rows={4}
          maxLength={1000}
          defaultValue={values.note}
          placeholder="Ghi ngắn gọn lý do nghỉ"
        />
        {error("note")}
      </div>
    </>
  );
}

function GateFields({
  values,
  actionErrors = false,
}: {
  values: Values;
  actionErrors?: boolean;
}) {
  const error = (field: string) =>
    actionErrors ? <ActionFieldError field={field} /> : <FieldError message={undefined} />;

  return (
    <>
      <div className="form-field">
        <label htmlFor="reason">Lý do xin phép</label>
        <select
          id="reason"
          className="field-control"
          name="reason"
          defaultValue={values.reason}
        >
          <option value="">Chọn lý do</option>
          {GATE_REASONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {error("reason")}
      </div>

      <div className="form-field">
        <label htmlFor="reasonText">Nếu chọn Khác, ghi rõ</label>
        <input
          id="reasonText"
          className="field-control"
          name="reasonText"
          type="text"
          maxLength={500}
          defaultValue={values.reasonText}
        />
        {error("reasonText")}
      </div>

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="outAt">Thời gian ra</label>
          <input
            id="outAt"
            className="field-control"
            name="outAt"
            type="datetime-local"
            defaultValue={values.outAt}
          />
          {error("outAt")}
        </div>
        <div className="form-field">
          <label htmlFor="expectedInAt">Dự kiến vào lại</label>
          <input
            id="expectedInAt"
            className="field-control"
            name="expectedInAt"
            type="datetime-local"
            defaultValue={values.expectedInAt}
          />
          {error("expectedInAt")}
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="note">Diễn giải</label>
        <textarea
          id="note"
          className="field-control"
          name="note"
          rows={4}
          maxLength={1000}
          defaultValue={values.note}
          placeholder="Ghi ngắn gọn nội dung cần xin phép"
        />
        {error("note")}
      </div>
    </>
  );
}

function LeaveStepTwo({ values, errors }: { values: Values; errors: Record<string, string> }) {
  return (
    <>
      <StepHeader step={2} kind="leave" />
      <IdentitySummary values={values} />
      <form id="leave-step-2" className="request-form" action="/don" method="get">
        <input name="buoc" type="hidden" value="3" />
        <IdentityFields values={values} />
        <LeaveFields values={values} errors={errors} />
        <HoursLine formId="leave-step-2" kind="leave" />
        <div className="form-actions">
          <a className="button button--secondary" href="/don">
            Quay lại
          </a>
          <button className="button button--primary" type="submit">
            Tiếp tục
          </button>
        </div>
      </form>
    </>
  );
}

function GateStepTwo({ values }: { values: Values }) {
  return (
    <>
      <StepHeader step={2} kind="gate" />
      <IdentitySummary values={values} />
      <SubmitForm formId="gate-submit">
        <IdentityFields values={values} />
        <ActionFieldError field="kind" />
        <ActionFieldError field="employeeId" />
        <GateFields values={values} actionErrors />
        <HoursLine formId="gate-submit" kind="gate" />
      </SubmitForm>
    </>
  );
}

function LeaveStepThree({ values }: { values: Values }) {
  return (
    <>
      <StepHeader step={3} kind="leave" />
      <IdentitySummary values={values} />
      <SubmitForm formId="leave-submit">
        <IdentityFields values={values} />
        <ActionFieldError field="kind" />
        <ActionFieldError field="employeeId" />
        {["fromDate", "toDate", "halfDay", "reason", "reasonText", "note"].map((field) => (
          <Fragment key={field}>
            <input name={field} type="hidden" value={values[field] ?? ""} />
            <ActionFieldError field={field} />
          </Fragment>
        ))}

        <NamePicker fieldName="handoverEmployeeId" label="Bàn giao công việc cho" />
        <ActionFieldError field="handoverEmployeeId" />

        <div className="form-field">
          <label htmlFor="makeupDate">Đề xuất ngày làm bù (không bắt buộc)</label>
          <input id="makeupDate" className="field-control" name="makeupDate" type="date" />
          <ActionFieldError field="makeupDate" />
        </div>

        <label className="commitment">
          <input name="committed" type="checkbox" />
          <span>
            Tôi cam kết việc nghỉ phép không ảnh hưởng đến công việc tôi đang phụ trách và đã bàn
            giao đầy đủ cho người được chọn ở trên.
          </span>
        </label>
        <ActionFieldError field="committed" />
        <HoursLine formId="leave-submit" kind="leave" />
      </SubmitForm>
    </>
  );
}

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const values = valuesOf(params);
  const kind = kindOf(values.kind);
  const step = requestedStep(values.buoc);

  if (step === 1) return <StepOne kind={kind} errors={{}} />;

  const first = validateStep(kind, 1, values);
  if (!first.ok) return <StepOne kind={kind} errors={first.errors} />;

  if (step === 2 || kind === "gate") {
    return kind === "leave" ? (
      <LeaveStepTwo values={values} errors={{}} />
    ) : (
      <GateStepTwo values={values} />
    );
  }

  const second = validateStep("leave", 2, values);
  if (!second.ok) return <LeaveStepTwo values={values} errors={second.errors} />;
  return <LeaveStepThree values={values} />;
}
