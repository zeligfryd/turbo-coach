import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface MonthOption {
  value: string;
  label: string;
}

interface MonthPickerProps {
  value: string;
  options: MonthOption[];
  onChange: (value: string) => void;
}

export function MonthPicker({ value, options, onChange }: MonthPickerProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Select month" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
