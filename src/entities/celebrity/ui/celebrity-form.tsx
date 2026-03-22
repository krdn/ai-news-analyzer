"use client";

import { useState } from "react";
import type { CelebrityCategory } from "@prisma/client";
import type { CreateCelebrityInput } from "@/entities/celebrity";
import { CATEGORY_LABELS } from "@/entities/celebrity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface CelebrityFormProps {
  onSubmit: (data: CreateCelebrityInput) => void | Promise<void>;
  isLoading?: boolean;
}

export function CelebrityForm({ onSubmit, isLoading }: CelebrityFormProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CelebrityCategory>("POLITICIAN");
  const [aliasesText, setAliasesText] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const aliases = aliasesText
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    await onSubmit({
      name: name.trim(),
      category,
      aliases,
      description: description.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">이름 *</Label>
        <Input
          id="name"
          placeholder="셀럽 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="category">카테고리</Label>
        <Select value={category} onValueChange={(val) => setCategory(val as CelebrityCategory)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(CATEGORY_LABELS) as [CelebrityCategory, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="aliases">별칭 (쉼표로 구분)</Label>
        <Input
          id="aliases"
          placeholder="별칭1, 별칭2"
          value={aliasesText}
          onChange={(e) => setAliasesText(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">설명</Label>
        <Textarea
          id="description"
          placeholder="셀럽에 대한 간단한 설명"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isLoading}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={isLoading || !name.trim()}>
        {isLoading ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
