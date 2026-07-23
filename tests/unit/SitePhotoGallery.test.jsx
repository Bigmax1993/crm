import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SitePhotoGallery } from "@/components/construction/SitePhotoGallery";

vi.mock("@/lib/resolve-stored-file-url", () => ({
  resolveStoredFileUrl: async (url) => url,
}));

describe("SitePhotoGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pokazuje pusty stan z możliwością wgrania", () => {
    render(
      <SitePhotoGallery
        photos={[]}
        onChange={() => {}}
        onUploadFiles={() => {}}
        onOpen={() => {}}
        onDownload={() => {}}
      />
    );
    expect(screen.getByText(/kliknij, aby wgrać zdjęcia/i)).toBeInTheDocument();
  });

  it("pokazuje miniatury i pozwala usuwać", () => {
    const onChange = vi.fn();
    render(
      <SitePhotoGallery
        photos={["data:image/png;base64,aaa", "data:image/png;base64,bbb"]}
        onChange={onChange}
        onUploadFiles={() => {}}
        onOpen={() => {}}
        onDownload={() => {}}
      />
    );
    expect(screen.getByText(/2 zdjęcia/i)).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: /usuń/i });
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith(["data:image/png;base64,bbb"]);
  });

  it("przekazuje wiele plików do onUploadFiles", async () => {
    const onUploadFiles = vi.fn();
    const { container } = render(
      <SitePhotoGallery
        photos={[]}
        onChange={() => {}}
        onUploadFiles={onUploadFiles}
        onOpen={() => {}}
        onDownload={() => {}}
      />
    );
    const input = container.querySelector('input[type="file"]');
    const f1 = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const f2 = new File(["b"], "b.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [f1, f2] } });
    await waitFor(() => {
      expect(onUploadFiles).toHaveBeenCalled();
    });
    expect(onUploadFiles.mock.calls[0][0]).toHaveLength(2);
  });
});
