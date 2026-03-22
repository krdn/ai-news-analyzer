import { describe, it, expect } from "vitest";
import {
  parsePostListHtml,
  parsePostDetailHtml,
  DcinsideCrawlerPlugin,
} from "./dcinside";

describe("디시인사이드 크롤러", () => {
  it("게시물 목록 HTML을 파싱한다", () => {
    const html = `
      <tr class="ub-content us-post" data-no="12345">
        <td class="gall_tit ub-word">
          <a href="/board/view/?id=hit&no=12345">테스트 제목</a>
        </td>
        <td class="gall_writer ub-writer"><span class="nickname">작성자1</span></td>
        <td class="gall_date">2026.03.22</td>
      </tr>
    `;
    const posts = parsePostListHtml(html, "hit");
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe("테스트 제목");
    expect(posts[0].postNo).toBe("12345");
    expect(posts[0].galleryId).toBe("hit");
  });

  it("댓글 데이터를 파싱한다", () => {
    const mockComments = [
      {
        memo: "좋은 글이네요",
        name: "댓글러1",
        rcnt: "3",
        reg_date: "2026.03.22 12:00:00",
      },
      {
        memo: "동의합니다",
        name: "댓글러2",
        rcnt: "1",
        reg_date: "2026.03.22 13:00:00",
      },
    ];
    const comments = parsePostDetailHtml(mockComments);
    expect(comments).toHaveLength(2);
    expect(comments[0].content).toBe("좋은 글이네요");
    expect(comments[0].author).toBe("댓글러1");
    expect(comments[0].likes).toBe(3);
  });

  it("빈 결과를 처리한다", () => {
    expect(parsePostListHtml("", "hit")).toHaveLength(0);
    expect(parsePostDetailHtml([])).toHaveLength(0);
  });

  it("sourceType이 COMMUNITY이다", () => {
    const plugin = new DcinsideCrawlerPlugin();
    expect(plugin.sourceType).toBe("COMMUNITY");
  });
});
