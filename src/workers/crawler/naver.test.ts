import { describe, it, expect } from "vitest";
import { parseNaverSearchResponse, parseNaverComments } from "./naver";
import { NaverCrawlerPlugin } from "./naver";

describe("네이버 뉴스 크롤러", () => {
  it("네이버 검색 API 응답을 파싱한다", () => {
    const mockResponse = {
      items: [
        {
          title: "<b>홍길동</b> 신작 발표",
          link: "https://news.naver.com/article/001/123",
          description: "홍길동이 신작을 발표했다",
          pubDate: "Mon, 22 Mar 2026 10:00:00 +0900",
        },
      ],
    };
    const articles = parseNaverSearchResponse(mockResponse, "celebrity-id-1");
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("홍길동 신작 발표");
    expect(articles[0].sourceUrl).toBe(
      "https://news.naver.com/article/001/123"
    );
    expect(articles[0].celebrityId).toBe("celebrity-id-1");
    expect(articles[0].sourceType).toBe("NAVER");
  });

  it("빈 검색 결과를 처리한다", () => {
    const mockResponse = { items: [] };
    const articles = parseNaverSearchResponse(mockResponse, "id");
    expect(articles).toHaveLength(0);
  });

  it("HTML 태그를 제거한다", () => {
    const mockResponse = {
      items: [
        {
          title: "<b>테스트</b> &amp; 제목",
          link: "https://example.com",
          description: "설명 <b>텍스트</b>",
          pubDate: "Mon, 22 Mar 2026 10:00:00 +0900",
        },
      ],
    };
    const articles = parseNaverSearchResponse(mockResponse, "id");
    expect(articles[0].title).toBe("테스트 & 제목");
  });

  it("댓글 데이터를 파싱한다", () => {
    const rawComments = [
      {
        contents: "좋은 기사네요",
        userName: "사용자1",
        sympathyCount: 10,
        antipathyCount: 2,
        modTime: "2026-03-22T10:00:00+0900",
      },
      {
        contents: "별로예요",
        userName: "사용자2",
        sympathyCount: 3,
        antipathyCount: 5,
        modTime: "2026-03-22T11:00:00+0900",
      },
    ];
    const comments = parseNaverComments(rawComments);
    expect(comments).toHaveLength(2);
    expect(comments[0].content).toBe("좋은 기사네요");
    expect(comments[0].author).toBe("사용자1");
    expect(comments[0].likes).toBe(10);
    expect(comments[1].content).toBe("별로예요");
  });

  it("빈 댓글 목록을 처리한다", () => {
    const comments = parseNaverComments([]);
    expect(comments).toHaveLength(0);
  });
});

describe("NaverCrawlerPlugin", () => {
  it("sourceType이 NAVER이다", () => {
    const plugin = new NaverCrawlerPlugin();
    expect(plugin.sourceType).toBe("NAVER");
  });
});
